import { render, screen } from "@testing-library/react";
import App from "../App";

describe("App", () => {
  it("renders the header and sidebar", () => {
    render(<App />);
    expect(screen.getByText("Kinetik Researcher")).toBeInTheDocument();
    expect(screen.getByText(/sample experiments/i)).toBeInTheDocument();
  });
});
