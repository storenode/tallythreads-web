import { describe, expect, it } from "vitest";
import {
  emptyShipment,
  shipmentSummary,
  shortDate,
  toShipmentPayload,
  validateShipment,
  type Shipment,
} from "./shipment";

const s = (over: Partial<Shipment>): Shipment => ({ ...emptyShipment(), ...over });

describe("validateShipment", () => {
  it("needs a transport mode", () => {
    expect(validateShipment(emptyShipment())).toEqual(["Choose how the stock travels"]);
  });

  it("courier needs the AWB, bus and lorry need the LR", () => {
    expect(validateShipment(s({ transport_mode: "courier" }))).toEqual(["Add the AWB / docket no."]);
    expect(validateShipment(s({ transport_mode: "bus" }))).toEqual(["Add the LR / booking no."]);
    expect(validateShipment(s({ transport_mode: "lorry", tracking_no: "  " }))).toEqual(["Add the LR no."]);
    expect(validateShipment(s({ transport_mode: "courier", tracking_no: "7845" }))).toEqual([]);
  });

  it("hand delivery and other need no tracking number", () => {
    expect(validateShipment(s({ transport_mode: "hand" }))).toEqual([]);
    expect(validateShipment(s({ transport_mode: "other" }))).toEqual([]);
  });

  it("freight needs a payer; a payer alone (amount unknown) is fine", () => {
    expect(validateShipment(s({ transport_mode: "hand", freight_paise: 35000 }))).toEqual([
      "Say who pays the freight — the organization or the store",
    ]);
    expect(validateShipment(s({ transport_mode: "hand", freight_paise: 35000, freight_paid_by: "store" }))).toEqual([]);
    expect(validateShipment(s({ transport_mode: "hand", freight_paid_by: "store" }))).toEqual([]);
  });

  it("rejects negative freight, bad box counts and non-dates", () => {
    const errs = validateShipment(
      s({ transport_mode: "hand", freight_paise: -1, freight_paid_by: "org", packages: 0, expected_at: "30/09" }),
    );
    expect(errs).toContain("Freight can't be negative");
    expect(errs).toContain("Boxes must be a whole number above 0");
    expect(errs).toContain("Expected arrival must be a date");
  });
});

describe("toShipmentPayload", () => {
  it("drops fields the chosen mode doesn't use", () => {
    const p = toShipmentPayload(
      s({ transport_mode: "hand", carrier_name: "DTDC", tracking_no: "7845", vehicle_no: "ap 39 ab 1234", contact_name: " Ravi " }),
    );
    expect(p.carrier_name).toBeNull();
    expect(p.tracking_no).toBeNull();
    expect(p.vehicle_no).toBe("AP 39 AB 1234");
    expect(p.contact_name).toBe("Ravi");
  });

  it("courier keeps carrier + AWB but not a vehicle", () => {
    const p = toShipmentPayload(s({ transport_mode: "courier", carrier_name: "DTDC", tracking_no: " 7845 ", vehicle_no: "X" }));
    expect(p).toMatchObject({ carrier_name: "DTDC", tracking_no: "7845", vehicle_no: null });
  });
});

describe("shipmentSummary", () => {
  const bus = s({
    transport_mode: "bus",
    carrier_name: "KPN Travels",
    tracking_no: "4471",
    packages: 3,
    expected_at: "2026-09-30",
  });

  it("reads like the LR slip", () => {
    expect(shipmentSummary(bus, "store")).toBe("KPN Travels · LR 4471 · 3 boxes · expected 30 Sep");
  });

  it("org-paid freight is shown to the org only", () => {
    const paid = { ...bus, freight_paise: 35000, freight_paid_by: "org" as const };
    expect(shipmentSummary(paid, "org")).toContain("Freight ₹350.00 paid");
    expect(shipmentSummary(paid, "store")).not.toContain("350");
  });

  it("store-paid (to-pay) freight is shown to both", () => {
    const toPay = { ...bus, freight_paise: 35000, freight_paid_by: "store" as const };
    expect(shipmentSummary(toPay, "store")).toContain("To pay ₹350.00");
    expect(shipmentSummary(toPay, "org")).toContain("To pay ₹350.00");
  });

  it("falls back to the mode label and names the hand-delivery person", () => {
    expect(shipmentSummary(s({ transport_mode: "hand", contact_name: "Ravi", packages: 1 }), "org")).toBe(
      "Hand delivery · by Ravi · 1 box",
    );
  });

  it("is empty when no shipment was recorded (older dispatches)", () => {
    expect(shipmentSummary(null, "org")).toBe("");
    expect(shipmentSummary(emptyShipment(), "store")).toBe("");
  });

  it("formats dates without a timezone shift", () => {
    expect(shortDate("2026-01-01")).toBe("1 Jan");
  });
});
