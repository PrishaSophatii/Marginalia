import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Log in or sign up",
  description: "Create a free Marginalia account to keep your papers, highlights and notes in sync.",
  alternates: { canonical: "/login" },
};

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
