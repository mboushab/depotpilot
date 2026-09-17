"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, clearSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations";

export type LoginState = {
  error?: string;
};

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Identifiants invalides." };
  }

  const user = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email.toLowerCase() }
  });

  if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
    return { error: "Identifiants invalides." };
  }

  await createSession({ id: user.id, email: user.email, name: user.name });
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
