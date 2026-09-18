import { redirect } from "next/navigation";

/** City/bank operations moved under the admin area. */
export default function CityRedirect() {
  redirect("/admin/city");
}
