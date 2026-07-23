import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Trash2, Shield, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LimitProfilesCard from "@/components/admin/LimitProfilesCard";
import BulkCreateUsersCard from "@/components/admin/BulkCreateUsersCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface UserProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
  limit_profile_id: string | null;
}

interface LimitProfileOption {
  id: string;
  name: string;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [limitProfiles, setLimitProfiles] = useState<LimitProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchLimitProfiles();
    }
  }, [isAdmin]);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (data) {
      setIsAdmin(true);
    } else {
      navigate("/");
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, avatar_url, status, created_at, limit_profile_id" as any)
      .order("created_at", { ascending: true });

    if (!error && data) setUsers(data as unknown as UserProfile[]);
    setLoading(false);
  };

  const fetchLimitProfiles = async () => {
    const { data, error } = await supabase
      .from("limit_profiles" as any)
      .select("id, name")
      .order("created_at", { ascending: true });

    if (!error && data) setLimitProfiles(data as unknown as LimitProfileOption[]);
  };

  const changeLimitProfile = async (userId: string, limitProfileId: string) => {
    const { error } = await supabase
      .from("profiles" as any)
      .update({ limit_profile_id: limitProfileId })
      .eq("id", userId);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, limit_profile_id: limitProfileId } : u))
      );
      toast({ title: "Perfil de limite atualizado" });
    }
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", userId);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
      );
      toast({ title: `Usuário ${newStatus === "active" ? "ativado" : "desativado"}` });
    }
  };

  const deleteUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast({ title: "Usuário excluído" });
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-primary/80">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Shield className="h-5 w-5" />
        <h1 className="text-lg font-semibold">Administração</h1>
      </header>

      <div className="flex-1 p-4 space-y-3">
        <LimitProfilesCard />
        <BulkCreateUsersCard />

        <div className="flex items-center gap-2 text-muted-foreground mb-2 pt-2">
          <Users className="h-4 w-4" />
          <span className="text-sm font-medium">{users.length} usuários</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          users.map((u) => (
            <Card key={u.id} className={u.status === "inactive" ? "opacity-60" : ""}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {u.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.status === "active" ? "Ativo" : "Inativo"}
                      {u.id === user?.id && " (você)"}
                    </p>
                  </div>

                  {u.id !== user?.id && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={u.status === "active"}
                        onCheckedChange={() => toggleStatus(u.id, u.status)}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir <strong>{u.name}</strong>? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteUser(u.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pl-[52px]">
                  <span className="text-xs text-muted-foreground shrink-0">Perfil de limite:</span>
                  <Select
                    value={u.limit_profile_id ?? undefined}
                    onValueChange={(value) => changeLimitProfile(u.id, value)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {limitProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
