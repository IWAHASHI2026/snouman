export default function Header() {
  return (
    <header className="bg-header-bg sticky top-0 z-40 px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <span className="text-2xl" role="img" aria-label="snowflake">
          ❄
        </span>
        <h1 className="text-lg font-bold text-foreground tracking-tight">
          Snow Man Reminder
        </h1>
      </div>
    </header>
  );
}
