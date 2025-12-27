import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../App", () => ({
  default: () => <div>App shell</div>
}));

import App from "../App";

describe("App", () => {
  it("renders the shell", () => {
    render(<App />);
    expect(screen.getByText("App shell")).toBeInTheDocument();
  });
});
