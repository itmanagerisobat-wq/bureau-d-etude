"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { EcranChargement } from "@/components/ui/Screens";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      router.replace(profile?.role === "ingenieur" ? "/mes-dossiers" : "/saisie");
    })();
  }, []);

  return <EcranChargement />;
}
