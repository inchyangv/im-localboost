import { redirect } from "next/navigation";

/** Merchant tools moved under the admin area. */
export default function MerchantRedirect() {
  redirect("/admin/merchant");
}
