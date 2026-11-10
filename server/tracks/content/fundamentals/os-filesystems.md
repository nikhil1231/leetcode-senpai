---
id: os-filesystems
category: systems
skill: systems
title: 'File systems: inodes, the page cache and crash safety'
minutes: 14
summary: A file is an inode (metadata and block pointers) plus directory entries that name it. Writes land in the page cache and reach the disk later, so a successful write() is not durable until fsync(). After a crash, journaling (or copy-on-write) keeps the file system's own structures consistent, but your data is only safe if your write pattern is. The pattern to know is write to a temporary file, fsync it, rename it over the old one, and fsync the directory. This is how databases, editors and package managers avoid torn or empty files.
objectives:
  - Describe inodes, directory entries, hard links and symbolic links
  - Trace a read and a write through file descriptors, the page cache and the disk
  - Explain what fsync guarantees and what write() does not
  - Explain journaling and copy-on-write, and what each protects
  - Write a file atomically and durably, and say what goes wrong without each step
sources:
  - ['Arpaci-Dusseau, Operating Systems: Three Easy Pieces, chapters 39 to 43 (files, FSCK and journaling, LFS)', 'https://pages.cs.wisc.edu/~remzi/OSTEP/']
  - ['Pillai et al., All File Systems Are Not Created Equal (OSDI 2014)', 'https://www.usenix.org/conference/osdi14/technical-sessions/presentation/pillai']
  - ['LWN: ext4 and data loss (2009)', 'https://lwn.net/Articles/322823/']
  - ['PostgreSQL fsync errors (the 2018 "fsyncgate")', 'https://wiki.postgresql.org/wiki/Fsync_Errors']
---

## Inodes and names

On a Unix file system, a file's identity is its **inode**: a numbered record holding its type, size, owner, permissions, timestamps, link count and pointers to its data blocks (direct and indirect pointers in ext2/3, **extents** like "blocks 9000 to 9255" in ext4 and XFS). The inode does *not* hold the name.

A **directory** is a file mapping names to inode numbers. So:

- A **hard link** is another directory entry pointing at the same inode. All names are equal; the data is freed when the link count reaches zero *and* no process has it open. That's why deleting a log file a process still writes to doesn't free the space (see [Linux processes](#/fundamentals/lesson/linux-processes)). Hard links can't cross file systems or point at directories.
- A **symbolic link** is a small file containing a path. It can point anywhere, including at nothing (a dangling link).
- **rename()** within a file system just rewrites directory entries, and POSIX makes it **atomic**: anyone opening the name sees either the old file or the new one, never a mix. That property is the basis of safe file updates.
- `df` counts blocks, but you can also run out of **inodes** (millions of tiny files): `df -i`.

```sort
prompt: Where is each piece of information stored?
buckets: [The inode, The directory entry, The data blocks]
items:
  - {text: 'The file''s name', bucket: 1, why: 'Names live in directories, which is why a file can have several.'}
  - {text: 'Permissions and owner', bucket: 0}
  - {text: 'How many hard links point at it', bucket: 0}
  - {text: 'The text of a log line', bucket: 2}
  - {text: 'Last modification time', bucket: 0}
  - {text: 'Which inode number "report.pdf" refers to', bucket: 1}
```

## From write() to the disk

A file descriptor (an integer) points at an entry in the kernel's open file table, which holds the current offset and flags and points at the inode. Data passes through the **page cache**:

- `read()` copies from cached pages, or faults them in from disk on a miss. Repeated reads of hot files cost no I/O, which is why free memory "disappears" into buff/cache.
- `write()` copies into the page cache, marks the pages **dirty**, and returns. The kernel writes dirty pages back seconds later (tens of seconds by default), in whatever order suits the disk.
- **`fsync(fd)`** blocks until that file's data and metadata are on stable storage (and asks the device to flush its own volatile cache). `fdatasync` skips metadata that isn't needed to read the data back. `O_DIRECT` bypasses the page cache, which databases with their own buffer pools use.

So a `write()` that returned success is **not durable**. Power loss in the next thirty seconds can lose it. Worse, if write-back later fails (a disk error), Linux reports it once on the next `fsync` and may drop the dirty pages; in 2018 Postgres discovered that retrying `fsync` after an error could return success for data that was never written, and since then it treats an fsync failure as a crash and recovers from its WAL.

```predict
prompt: A program writes 100 KB to a file with write(), checks the return value (100 KB written), prints "saved", and the machine loses power two seconds later. After reboot, what is in the file?
choices:
  - text: Exactly the 100 KB, because write() succeeded
  - text: Possibly nothing, part of it, or all of it - the data may have been only in the page cache
  - text: The 100 KB, because journaling file systems make every write durable as soon as it returns
  - text: A corrupted file system that needs fsck
answer: 1
reveal: |
  write() succeeded at copying the bytes into the page cache. Whether any of them reached the disk depends on when write-back ran. A journaling file system keeps its own metadata consistent (so no fsck needed, and with ext4's default data=ordered mode, no garbage from other files), but it doesn't make your data durable. Only fsync (or fdatasync, or opening with O_SYNC) gives that guarantee.
```

## Crash consistency

Appending a block touches several structures: the data block, the inode (size, pointers) and the free-block bitmap. A crash between those writes leaves them inconsistent: an inode pointing at a block marked free, or a block allocated to nobody. Old file systems ran **fsck** at boot to scan everything, which took hours on large disks.

- **Journaling** (ext4, XFS, NTFS): write the intended changes to a log first, mark the transaction committed, then apply them in place. After a crash, replay committed transactions and discard incomplete ones. Recovery takes seconds. Most journal **metadata only**; ext4's default `data=ordered` writes a file's data blocks before committing the metadata that points at them, so a crash never exposes stale blocks. `data=journal` journals data too, at a cost in throughput.
- **Copy-on-write** (ZFS, btrfs, APFS): never overwrite in place. Write new blocks, then atomically switch a root pointer. Snapshots are nearly free, and checksums catch silent corruption.
- **Log-structured** designs write everything sequentially; the same idea underlies LSM-tree databases.

None of these make *your* multi-step update atomic. They keep the file system's own bookkeeping sane.

## Updating a file safely

Overwriting a config file in place (`open(path, 'w')`, write, close) has a window where the file is truncated or half-written. A crash then leaves it empty or torn. The safe pattern:

```text
fd = open("config.json.tmp", O_WRONLY|O_CREAT|O_TRUNC)
write(fd, new_contents); fsync(fd); close(fd)   # 1. new data durable under a temporary name
rename("config.json.tmp", "config.json")        # 2. atomic switch of the name
dfd = open(".", O_DIRECTORY); fsync(dfd)        # 3. make the rename itself durable
```

```timeline
title: Replacing config.json after a crash
lanes: [Program, Page cache, Disk]
state: {'config.json on disk': 'old version', 'tmp file on disk': none}
steps:
  - {lane: Program, to: Page cache, text: 'write new contents to config.json.tmp'}
  - {lane: Program, to: Disk, text: 'fsync(tmp): data reaches the disk', set: {'tmp file on disk': 'new version'}}
  - {lane: Program, to: Page cache, text: 'rename(tmp, config.json): directory entry changed in cache'}
  - {lane: Program, to: Disk, text: 'fsync(directory): the rename reaches the disk', set: {'config.json on disk': 'new version', 'tmp file on disk': none}}
crashes:
  - after: 0
    label: before fsync of the data
    verdict: safe
    text: config.json still names the old, complete file. The tmp file may be empty or partial; clean it up on start.
  - after: 2
    label: after rename, before fsync of the directory
    verdict: safe
    text: Either the rename survived (new file) or it didn't (old file). Both are complete, because the data was fsynced first. The program may have told the user "saved" too early, though, which is why step 4 exists.
  - after: 3
    label: after everything
    verdict: safe
    text: The new version is durable under the real name.
```

Skip the first fsync and a crash after the rename can leave config.json pointing at an inode whose data never reached the disk: an empty file. This exact bug hit many applications on ext4 in 2009, when delayed allocation widened the window, and the kernel added a heuristic to flush data before such renames. Don't rely on the heuristic. Databases solve the same problem with a **write-ahead log**: append and fsync the change to the log, then update the data files lazily.

```recall
prompt: Explain how you would write a file so that after a crash it contains either the old contents or the new contents, never a mix or nothing, and why each step matters.
points:
  - Write the new contents to a temporary file in the same directory (same file system)
  - fsync the temporary file so its data is durable before it becomes visible
  - rename it over the original, which POSIX makes atomic
  - fsync the directory so the rename itself is durable
  - Without the first fsync a crash can leave an empty or partial file under the real name
model: |
  Never overwrite in place: truncating and rewriting leaves a window where a crash gives an empty or half-written file. Instead write the new contents to a temporary file in the same directory, so it's on the same file system, and fsync it, so the data is on disk before anything points at it. Then rename the temporary file over the original. Rename is atomic in POSIX, so any reader sees the old file or the new one. Finally fsync the directory, because the rename is a change to the directory and isn't durable until that's flushed; until then a crash may revert to the old file, which is still complete but means you reported success too early. Skipping the first fsync is the classic bug: the rename can reach disk before the data, leaving the real name pointing at an empty file.
```

```questions
- kind: check
  prompt: You delete a 20 GB log file with rm, but df shows no space freed. Why?
  choices:
    - text: A process still has it open, so the inode and blocks survive until it's closed
      correct: true
    - text: rm only moves files to a hidden trash directory until the next reboot
      why: rm removes the directory entry immediately.
    - text: The journal still holds a copy of the file's data until the next checkpoint
      why: The journal holds recent metadata changes, not 20 GB of data.
    - text: df caches its numbers for an hour
      why: df reads current file system statistics.
  explanation: Data is freed when the link count is zero and no descriptor refers to it.
- kind: check
  prompt: What does journaling in ext4's default mode protect after a crash?
  choices:
    - text: Its own metadata stays consistent, and files never show another file's stale blocks
      correct: true
    - text: Every write() that had returned successfully before the crash is safely on disk
      why: Only fsynced data is guaranteed.
    - text: Application-level updates spanning several files are atomic
      why: The file system knows nothing about your multi-file update.
  explanation: data=ordered writes data blocks before committing the metadata that points to them.
- kind: check
  prompt: Why must the temporary file be fsynced before renaming it over the original?
  choices:
    - text: Otherwise the rename can reach disk before the data, leaving an empty file under the real name
      correct: true
    - text: rename() fails with an error on any file that still has unwritten dirty pages
      why: It succeeds; the danger is the ordering on disk.
    - text: fsync makes the rename atomic
      why: rename is atomic already; fsync makes the data durable.
    - text: It isn't needed on journaling file systems such as ext4, which order this for you
      why: Journaling protects metadata, not your data's ordering.
  explanation: Data durable first, then make it visible under the real name.
- kind: check
  prompt: What's the difference between a hard link and a symbolic link?
  choices:
    - text: A hard link is another name for the same inode; a symlink is a file containing a path
      correct: true
    - text: A hard link is a full copy of the file's data that is kept in sync automatically
      why: No data is copied.
    - text: Symlinks can't point across file systems
      why: Hard links can't; symlinks can.
  explanation: Deleting a symlink's target leaves a dangling link; deleting one hard link leaves the others intact.
- kind: fire
  prompt: Which call guarantees a file's data has reached stable storage?
  choices:
    - text: fsync
      correct: true
    - text: write
      why: It only reaches the page cache.
    - text: close
      why: close doesn't flush to disk.
  explanation: fdatasync is a lighter variant.
- kind: fire
  prompt: What does an inode NOT contain?
  choices:
    - text: The file's name
      correct: true
    - text: The file's size
      why: Size is in the inode.
    - text: Pointers to data blocks
      why: Block pointers or extents are in the inode.
  explanation: Names are directory entries.
- kind: fire
  prompt: Which POSIX operation is atomic and used to replace files safely?
  choices:
    - text: rename
      correct: true
    - text: truncate
      why: Truncate then write leaves a window.
    - text: unlink
      why: Unlink removes a name.
  explanation: Readers see the old file or the new one.
- kind: fire
  prompt: A disk has free space but file creation fails with "No space left on device". What should you check?
  choices:
    - text: Inode usage with df -i
      correct: true
    - text: The size of the page cache in free -h
      why: Cache doesn't block file creation.
    - text: ulimit -n
      why: That's open descriptors, a different error.
  explanation: Millions of tiny files can exhaust inodes first.
- kind: fire
  prompt: How do copy-on-write file systems like ZFS stay consistent after a crash?
  choices:
    - text: They write changes to new blocks, then atomically switch a root pointer
      correct: true
    - text: They run a full consistency check (fsck) on every boot before mounting
      why: That's the pre-journaling approach.
    - text: They keep everything in RAM until shutdown
      why: They write continuously.
  explanation: Snapshots and checksums fall out of the same design.
```
