"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export type SignUpState = { error?: string };

export async function signUp(_previous: SignUpState, formData: FormData): Promise<SignUpState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) return { error: "Please complete every field." };
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 12) } });
  redirect(`/login?created=1&email=${encodeURIComponent(email)}`);
}
