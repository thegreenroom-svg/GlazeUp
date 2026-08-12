import { AppShell } from './AppShell';
import PinGate from '@/components/PinGate';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <PinGate>
      <AppShell>{children}</AppShell>
    </PinGate>
  );
}
