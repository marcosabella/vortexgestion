import { CircleHelp, Lightbulb, ListChecks, Route } from "lucide-react";
import { useLocation } from "react-router-dom";
import { getModuleHelp } from "@/config/moduleHelp";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const HelpList = ({ items }: { items: string[] }) => (
  <ul className="space-y-2">
    {items.map((item) => (
      <li key={item} className="flex gap-2 text-sm leading-6 text-muted-foreground">
        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

export function ModuleHelp() {
  const { pathname } = useLocation();
  const moduleHelp = getModuleHelp(pathname);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label={`Ayuda: ${moduleHelp.title}`}>
          <CircleHelp className="h-4 w-4" />
          <span className="hidden md:inline">Ayuda</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
        <SheetHeader className="border-b bg-muted/30 px-6 py-5 pr-12 text-left">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-primary">
            <CircleHelp className="h-4 w-4" /> Ayuda del módulo
          </div>
          <SheetTitle className="text-2xl">{moduleHelp.title}</SheetTitle>
          <SheetDescription className="leading-6">{moduleHelp.summary}</SheetDescription>
        </SheetHeader>
        <ScrollArea
          type="always"
          className="h-[calc(100vh-145px)]"
          scrollbarClassName="w-3 bg-slate-200/80 p-0.5 dark:bg-slate-800"
          thumbClassName="bg-slate-700 hover:bg-slate-900 dark:bg-slate-300 dark:hover:bg-white"
        >
          <div className="space-y-5 p-6">
            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold"><CircleHelp className="h-4 w-4 text-primary" />¿Para qué sirve?</h3>
              <p className="text-sm leading-6 text-muted-foreground">{moduleHelp.purpose}</p>
            </section>
            <Accordion type="multiple" defaultValue={["features", "steps"]} className="rounded-lg border px-4">
              <AccordionItem value="features">
                <AccordionTrigger className="gap-3 text-left"><span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />Funciones principales</span></AccordionTrigger>
                <AccordionContent><HelpList items={moduleHelp.features} /></AccordionContent>
              </AccordionItem>
              <AccordionItem value="steps">
                <AccordionTrigger className="gap-3 text-left"><span className="flex items-center gap-2"><Route className="h-4 w-4 text-primary" />Cómo utilizarlo</span></AccordionTrigger>
                <AccordionContent>
                  <ol className="space-y-3">
                    {moduleHelp.steps.map((step, index) => (
                      <li key={step} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="tips" className="border-b-0">
                <AccordionTrigger className="gap-3 text-left"><span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" />Recomendaciones</span></AccordionTrigger>
                <AccordionContent><HelpList items={moduleHelp.tips} /></AccordionContent>
              </AccordionItem>
            </Accordion>
            <p className="text-center text-xs text-muted-foreground">La ayuda cambia automáticamente según la pantalla que estés utilizando.</p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
