import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ResultRow {
  email: string;
  ok: boolean;
  error?: string;
}

// Bypasses the normal signup screen's email-confirmation rate limit
// entirely (accounts are created pre-confirmed via the Admin API, server
// -side in the bulk-create-users Edge Function) — meant for onboarding
// several family members at once instead of one every few hours.
export default function BulkCreateUsersCard() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);

  const parseLines = () => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email, name] = line.split(",").map((part) => part?.trim());
        return { email, name };
      });
  };

  const handleSubmit = async () => {
    const users = parseLines();
    if (users.length === 0) {
      toast({ title: "Nada para criar", description: "Cole ao menos uma linha email,nome.", variant: "destructive" });
      return;
    }
    if (!defaultPassword.trim()) {
      toast({ title: "Senha padrão obrigatória", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    setResults(null);
    const { data, error } = await supabase.functions.invoke("bulk-create-users", {
      body: { users, defaultPassword: defaultPassword.trim() },
    });
    setSubmitting(false);

    if (error) {
      toast({ title: "Erro ao criar usuários", description: error.message, variant: "destructive" });
      return;
    }

    setResults(data.results as ResultRow[]);
    const okCount = (data.results as ResultRow[]).filter((r) => r.ok).length;
    toast({ title: `${okCount} de ${data.results.length} usuário(s) criado(s)` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" /> Criar usuários em massa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Uma linha por usuário, no formato <code>email,nome</code>. Contas são criadas já com e-mail confirmado —
          não passam pelo limite de confirmação da tela de cadastro.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"maria@exemplo.com,Maria\npedro@exemplo.com,Pedro"}
          rows={6}
        />
        <div className="space-y-1.5">
          <Label htmlFor="default-password">Senha padrão (todos os usuários)</Label>
          <Input
            id="default-password"
            type="text"
            value={defaultPassword}
            onChange={(e) => setDefaultPassword(e.target.value)}
            placeholder="Senha inicial"
          />
        </div>
        <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Criando..." : "Criar usuários"}
        </Button>

        {results && (
          <div className="space-y-1 pt-2 border-t border-border">
            {results.map((r) => (
              <div key={r.email} className="flex items-center gap-2 text-sm">
                {r.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <span className="truncate">{r.email}</span>
                {!r.ok && <span className="text-xs text-destructive truncate">{r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
