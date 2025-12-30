import { render, screen } from "@testing-library/react";
import App from "../App";

describe("App", () => {
  it("renders header and first step", () => {
    render(<App />);
    expect(screen.getByText("Kinetik Researcher")).toBeInTheDocument();
    expect(screen.getByText(/Projekt „Researcher Draft“/i)).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
  });
});
