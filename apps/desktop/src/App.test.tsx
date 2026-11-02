import "@testing-library/jest-dom/vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  clearMocks();
});

test("shows the native greeting for the entered name", async () => {
  const greeting = "Hello, Ada!";
  const handleCommand = vi.fn<Parameters<typeof mockIPC>[0]>(() => greeting);
  mockIPC(handleCommand);
  const user = userEvent.setup();

  render(<App />);
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Ada");
  await user.click(
    screen.getByRole("button", { name: "Check native connection" }),
  );

  expect(handleCommand).toHaveBeenCalledWith("greet", { name: "Ada" });
  expect(screen.getByRole("status")).toHaveTextContent(greeting);
});
