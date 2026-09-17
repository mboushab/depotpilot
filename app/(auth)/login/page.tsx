import { redirect } from "next/navigation";
import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Image src="/logo-mark.png" alt="Logo" width={44} height={44} className="mb-4 rounded-md" />
          <CardTitle className="text-xl">Connexion administrateur</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Accès sécurisé à l’exploitation du dépôt.</p>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
