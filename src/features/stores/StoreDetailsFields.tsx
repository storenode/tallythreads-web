import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/Input";

/**
 * Address / contact / GSTIN / business-hours fields, shared by StoreCreatePage and
 * StoreEditPage (same reuse pattern as MemberForm's field-block components) — added
 * 2026-08-31 to close the gap M1-schema-reference.md used to flag ("GSTIN, address,
 * and other business-registration fields are not yet speced at the store level").
 * Every field here is optional: a single-branch operator can leave all of it blank
 * and the store just relies on the organization's own registration details; a
 * multi-branch chain fills these in per store — GSTIN included, since branches in
 * different states legitimately need distinct GST numbers, which is exactly the open
 * question this doc used to raise.
 */
export interface StoreDetailsFormValues {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone_number: string;
  email: string;
  gstin: string;
  opening_time: string;
  closing_time: string;
}

export function StoreDetailsFields() {
  const { register } = useFormContext<StoreDetailsFormValues>();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label="Address line 1" {...register("address_line1")} />
      <Input label="Address line 2" {...register("address_line2")} />
      <Input label="City" {...register("city")} />
      <Input label="State" {...register("state")} />
      <Input label="Pincode" {...register("pincode")} />
      <Input label="Country" {...register("country")} />
      <Input
        label="Phone number"
        type="tel"
        placeholder="98765 43210"
        {...register("phone_number")}
      />
      <Input
        label="Email"
        type="email"
        placeholder="store@example.com"
        {...register("email")}
      />
      <Input label="GSTIN" placeholder="22AAAAA0000A1Z5" {...register("gstin")} />
      <div className="hidden sm:block" aria-hidden />
      <Input label="Opening time" type="time" {...register("opening_time")} />
      <Input label="Closing time" type="time" {...register("closing_time")} />
    </div>
  );
}
