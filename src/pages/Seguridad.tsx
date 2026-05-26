import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Seguridad() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Las contrasenas no coinciden",
        description: "Revise la confirmacion antes de guardar.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.updateUser({
      password,
      data: {
        must_change_password: false,
      },
    });

    setIsSubmitting(false);

    if (error) {
      toast({
        title: "No se pudo actualizar",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setPassword("");
    setConfirmPassword("");
    toast({
      title: "Contrasena actualizada",
      description: "El cambio quedo aplicado a su usuario de ingreso.",
    });
  };

  return (
    <div className="container mx-auto max-w-xl p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Seguridad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contrasena</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contrasena</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" variant="success" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Actualizar contrasena"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
