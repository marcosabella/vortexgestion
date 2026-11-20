import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const oscuro = resolvedTheme === "dark";
  const etiqueta = oscuro ? "Activar modo claro" : "Activar modo oscuro";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={etiqueta}
      aria-pressed={oscuro}
      title={etiqueta}
      onClick={() => setTheme(oscuro ? "light" : "dark")}
    >
      {oscuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{etiqueta}</span>
    </Button>
  );
}
