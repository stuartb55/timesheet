import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Findings } from "./findings";
import { FlashMessage } from "./flash-message";
import { StatCard } from "./stat-card";

describe("accessible summary components", () => {
  it("renders a labelled statistic", () => {
    render(<StatCard label="Today’s balance" value="+36 min" />);
    expect(screen.getByText("Today’s balance")).toHaveClass("govuk-body-s");
    expect(screen.getByText("+36 min")).toBeVisible();
  });

  it("renders the compliant result when there are no findings", () => {
    render(<Findings findings={[]} />);
    expect(screen.getByText("Compliant")).toHaveClass(
      "govuk-tag",
      "govuk-tag--green",
    );
  });

  it("announces validation errors", () => {
    render(
      <FlashMessage
        error="Finish time must be after start time"
        errorTarget="segment-new-finish"
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("govuk-error-summary");
    expect(alert).toHaveTextContent("Finish time must be after start time");
    expect(
      screen.getByRole("link", {
        name: "Finish time must be after start time",
      }),
    ).toHaveAttribute("href", "#segment-new-finish");
  });
});
