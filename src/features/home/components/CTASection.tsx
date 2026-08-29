import { Link } from "react-router-dom";
import { Container } from "@/components/ui/Container";
import { GoogleSignInButton } from "@/features/home/components/GoogleSignInButton";

export function CTASection() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="rounded-3xl bg-gradient-to-br from-tt-green-500 to-tt-lavender-600 px-6 py-16 text-center sm:px-16">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Bring your store online, at your own pace
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/85">
            Start with billing and inventory. Add purchase-trip tracking and reports
            when you're ready — everything works offline from day one.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3">
            <GoogleSignInButton />
            <Link to="/login" className="text-sm font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
