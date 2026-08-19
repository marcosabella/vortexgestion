import { useEffect, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Bold, Italic, List, ListOrdered, Redo2, UnderlineIcon, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_DESCRIPTION_COLORS, PRODUCT_DESCRIPTION_SIZES } from "@/utils/productDescription";

type ProductDescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function ProductDescriptionEditor({ value, onChange }: ProductDescriptionEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color, FontSize, Underline],
    content: value,
    editorProps: {
      attributes: {
        class: "min-h-44 px-4 py-3 text-sm leading-7 outline-none [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_ol]:ml-6 [&_ol]:list-decimal [&_ul]:ml-6 [&_ul]:list-disc [&_p]:mb-2",
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  const commandButton = (label: string, active: boolean, action: () => void, icon: ReactNode) => (
    <Button type="button" variant={active ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" aria-label={label} title={label} onClick={action}>
      {icon}
    </Button>
  );

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-2">
        {commandButton("Negrita", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold className="h-4 w-4" />)}
        {commandButton("Cursiva", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic className="h-4 w-4" />)}
        {commandButton("Subrayado", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon className="h-4 w-4" />)}
        <span className="mx-1 h-6 w-px bg-border" />
        {commandButton("Título", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <span className="font-bold">T1</span>)}
        {commandButton("Subtítulo", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <span className="font-bold">T2</span>)}
        {commandButton("Lista", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List className="h-4 w-4" />)}
        {commandButton("Lista numerada", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />)}
        <span className="mx-1 h-6 w-px bg-border" />
        <select className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="Tamaño del texto" value={editor.getAttributes("textStyle").fontSize || "16px"} onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}>
          <option value={PRODUCT_DESCRIPTION_SIZES[0]}>Pequeño</option>
          <option value={PRODUCT_DESCRIPTION_SIZES[1]}>Normal</option>
          <option value={PRODUCT_DESCRIPTION_SIZES[2]}>Grande</option>
        </select>
        <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs">
          Color
          <select className="h-6 bg-transparent" aria-label="Color del texto" value={editor.getAttributes("textStyle").color || PRODUCT_DESCRIPTION_COLORS[0]} onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}>
            <option value="#19352f">Verde</option>
            <option value="#52645d">Gris</option>
            <option value="#d65e37">Naranja</option>
            <option value="#111827">Negro</option>
            <option value="#b42318">Rojo</option>
          </select>
        </label>
        <span className="mx-1 h-6 w-px bg-border" />
        {commandButton("Deshacer", false, () => editor.chain().focus().undo().run(), <Undo2 className="h-4 w-4" />)}
        {commandButton("Rehacer", false, () => editor.chain().focus().redo().run(), <Redo2 className="h-4 w-4" />)}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
