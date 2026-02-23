import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useState, useCallback } from "react";
import type { CallMode } from "@/hooks/use-webrtc";
import SplashScreen from "@/components/SplashScreen";
import ErrorBoundary from "@/components/ErrorBoundary";
import InstallPrompt from "@/components/InstallPrompt";
import IncomingCallDialog from "@/components/call/IncomingCallDialog";
import ActiveCallOverlay from "@/components/call/ActiveCallOverlay";
import { useIncomingCalls } from "@/hooks/use-incoming-calls";
import { useWebRTC } from "@/hooks/use-webrtc";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { isNativePlatform } from "@/lib/capacitor-push";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChatList from "./pages/ChatList";
import ChatScreen from "./pages/ChatScreen";
import NewChat from "./pages/NewChat";
import Profile from "./pages/Profile";
import AdminUsers from "./pages/AdminUsers";
import CallHistory from "./pages/CallHistory";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function IncomingCallHandler() {
  const { user } = useAuth();
  const { incomingCall, dismissIncoming } = useIncomingCalls(user?.id);
  usePushNotifications(user?.id);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const handleRemoteStream = useCallback((stream: MediaStream) => {
    setRemoteStream(stream);
  }, []);

  const handleCallEnded = useCallback(() => {
    dismissIncoming();
  }, [dismissIncoming]);

  const {
    callStatus,
    callMode,
    answerCall,
    endCall,
    rejectCall,
    getLocalStream,
  } = useWebRTC({
    userId: user?.id ?? "",
    onRemoteStream: handleRemoteStream,
    onCallEnded: handleCallEnded,
  });

  const handleAccept = (mode: CallMode = "audio") => {
    if (incomingCall) {
      answerCall(incomingCall.id, mode);
      dismissIncoming();
    }
  };

  const handleReject = () => {
    if (incomingCall) {
      rejectCall(incomingCall.id);
      dismissIncoming();
    }
  };

  return (
    <>
      {incomingCall && callStatus === "idle" && (
        <IncomingCallDialog
          callerName={incomingCall.callerName}
          callerAvatar={incomingCall.callerAvatar}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
      {callStatus !== "idle" && (
        <ActiveCallOverlay
          peerName={incomingCall?.callerName ?? "Usuário"}
          peerAvatar={incomingCall?.callerAvatar}
          status={callStatus as "calling" | "ringing" | "answered"}
          mode={callMode}
          localStream={getLocalStream()}
          remoteStream={remoteStream}
          onHangUp={() => endCall()}
        />
      )}
    </>
  );
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const isNative = isNativePlatform();

  return (
    <>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      {!isNative && <InstallPrompt />}
      <ErrorBoundary silent>
        <IncomingCallHandler />
      </ErrorBoundary>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<ProtectedRoute><ChatList /></ProtectedRoute>} />
        <Route path="/chat/:chatId" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />
        <Route path="/new-chat" element={<ProtectedRoute><NewChat /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/calls" element={<ProtectedRoute><CallHistory /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
