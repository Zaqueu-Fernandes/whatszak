import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, ArrowLeft, LogOut, Bell, BellRing } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { requestFCMToken } from "@/lib/firebase";
import { sendPushToUser } from "@/lib/push";

export default function Profile() {
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.name);
          setAvatarUrl(data.avatar_url);
        }
      });
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    setAvatarUrl(publicUrl);
    setUploading(false);
    toast({ title: "Avatar atualizado!" });
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
    setLoading(false);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Perfil atualizado!" });
    }
  };

  const initials = name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-primary/80">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Perfil</h1>
      </header>

      <div className="flex-1 p-4">
        <Card>
          <CardHeader className="items-center">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                  {initials || "?"}
                </AvatarFallback>
              </Avatar>
              <label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </label>
            </div>
            <CardTitle className="mt-2">{name || "Seu nome"}</CardTitle>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" className="w-full" onClick={async () => {
              try {
                if (!("Notification" in window)) {
                  toast({ title: "⚠️ API Notification não disponível", description: "No app nativo, as push notifications usam FCM diretamente. Testando token FCM...", });
                  const token = await requestFCMToken();
                  if (token) {
                    toast({ title: "✅ Token FCM obtido!", description: token.substring(0, 30) + "..." });
                  } else {
                    toast({ title: "❌ Token não obtido", variant: "destructive" });
                  }
                  return;
                }
                const perm = Notification.permission;
                toast({ title: `Permissão atual: ${perm}` });
                if (perm === "default") {
                  const result = await Notification.requestPermission();
                  toast({ title: `Resultado: ${result}` });
                }
                const token = await requestFCMToken();
                if (token) {
                  toast({ title: "✅ Token FCM obtido!", description: token.substring(0, 30) + "..." });
                } else {
                  toast({ title: "❌ Token não obtido", description: "Verifique permissão ou suporte do navegador", variant: "destructive" });
                }
              } catch (err: any) {
                toast({ title: "Erro", description: err.message, variant: "destructive" });
              }
            }}>
              <Bell className="mr-2 h-4 w-4" />
              Testar Permissão de Notificação
            </Button>
            <Button variant="outline" className="w-full" onClick={async () => {
              if (!user) return;
              try {
                await sendPushToUser(user.id, "Teste Push", "Se você viu isso, push funciona! 🎉", {});
                toast({ title: "Push enviado para você mesmo!" });
              } catch (err: any) {
                toast({ title: "Erro ao enviar push", description: err.message, variant: "destructive" });
              }
            }}>
              <BellRing className="mr-2 h-4 w-4" />
              Enviar Push para Mim
            </Button>
            <Button variant="outline" className="w-full text-destructive" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
