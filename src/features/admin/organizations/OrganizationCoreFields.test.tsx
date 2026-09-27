import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import {
  OrganizationCoreFields,
  type OrganizationCoreFormValues,
} from "./OrganizationCoreFields";

function Harness({
  defaults,
  storeCodes,
}: {
  defaults?: Partial<OrganizationCoreFormValues>;
  storeCodes?: (string | null)[];
}) {
  const form = useForm<OrganizationCoreFormValues>({
    defaultValues: {
      name: "",
      org_code: "",
      registration_type: "chain",
      is_demo: false,
      ...defaults,
    },
  });
  return (
    <FormProvider {...form}>
      <OrganizationCoreFields storeCodes={storeCodes} />
    </FormProvider>
  );
}

const shortCode = () => screen.getByLabelText("Short code") as HTMLInputElement;

describe("OrganizationCoreFields short code", () => {
  it("suggests the name's initials while you type the name", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Organization name"), "Vasavi Cloth Store");
    expect(shortCode().value).toBe("VCS");
  });

  it("prefers the prefix the org's store codes share", () => {
    render(
      <Harness
        defaults={{ name: "BANDRIP STREETWEAR STORE" }}
        storeCodes={["BND-KDP", "BND-NLR"]}
      />,
    );
    expect(shortCode().value).toBe("BND");
  });

  it("never overwrites a code the user typed", async () => {
    render(<Harness />);
    await userEvent.type(shortCode(), "ABC");
    await userEvent.type(screen.getByLabelText("Organization name"), "Sri Lakshmi Textiles");
    expect(shortCode().value).toBe("ABC");
  });

  it("keeps a saved code in edit mode", async () => {
    render(<Harness defaults={{ name: "Old Name", org_code: "OLD" }} />);
    await userEvent.type(screen.getByLabelText("Organization name"), " Renamed");
    expect(shortCode().value).toBe("OLD");
  });
});
