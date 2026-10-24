import Link from "next/link";
export default function NotFound() {
  return (
    <section className="page-heading container">
      <span className="eyebrow">A SMALL DETOUR</span>
      <h1>This story isn’t here.</h1>
      <p>The page you’re looking for couldn’t be found.</p>
      <Link className="button button-dark" href="/">
        Back to DubbingNow →
      </Link>
    </section>
  );
}
