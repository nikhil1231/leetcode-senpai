import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing while closed", () => { render(<Modal open={false} title="T">body</Modal>); expect(screen.queryByText("body")).toBeNull(); });
  it("closes on Escape and on a click on the backdrop, but not on a click inside", () => {
    const onClose = vi.fn();
    const { container } = render(<Modal open onClose={onClose} title="T">body</Modal>);
    fireEvent.mouseDown(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector(".overlay")!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("stays put when locked", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} locked title="T">body</Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
