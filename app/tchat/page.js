import { redirect } from "next/navigation";

// Le « Tchat » s'appelle désormais « Messagerie ».
export default function TchatPage() {
  redirect("/messagerie");
}
