/**
 * Landing page shown at /.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <title>TopSend</title>
      <h1 className="text-4xl font-bold">TopSend</h1>
      <p className="text-lg">Local bouldering competitions in Toronto.</p>
    </main>
  );
}
