# Cache product lookups in Redis

`GET /products/{id}` is our hottest endpoint and p99 is 900 ms at peak. This
caches the product payload in Redis for 10 minutes.

- Read-through cache in `get_product`
- Invalidate on update
- Pickle for speed (JSON was slower in a microbenchmark)

Load test: p99 drops to 40 ms with a warm cache.
