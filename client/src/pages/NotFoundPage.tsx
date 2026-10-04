import { Link } from "react-router-dom";

/**
 * Shown for any path that no route matches.
 */
export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <title>Page not found | TopSend</title>
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <Link to="/" className="underline underline-offset-4">
        Go to the home page
      </Link>
    </main>
  );
}
