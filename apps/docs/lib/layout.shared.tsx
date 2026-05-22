import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { BookOpenText, GitBranch, Terminal } from "lucide-react";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2 font-semibold tracking-normal">
          <span className="grid size-7 place-items-center rounded-sm bg-fd-foreground text-[12px] font-black text-fd-background">
            w
          </span>
          <span>wooo</span>
        </div>
      ),
    },
    links: [
      {
        text: "Docs",
        url: "/docs",
        icon: <BookOpenText className="size-4" />,
      },
      {
        text: "CLI",
        url: "/docs/cli",
        icon: <Terminal className="size-4" />,
      },
      {
        text: "GitHub",
        url: "https://github.com/daoleno/wooo-cli",
        external: true,
        icon: <GitBranch className="size-4" />,
      },
    ],
  };
}
