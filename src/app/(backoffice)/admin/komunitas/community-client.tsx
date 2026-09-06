"use client";

import * as React from "react";
import { Plus, CalendarDays, Users, Building, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, StatCard } from "@/components/ui/data-display";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Event = { id: string; title: string; category: string; description: string | null; start_time: string; end_time: string | null; location_text: string | null; organizer: string | null; needs_volunteers: boolean; volunteer_target: number; is_public: boolean; registered_count: number; volunteer_count: number };
type Facility = { id: string; name: string; facility_type: string; description: string | null; capacity: number | null; is_bookable: boolean; asset_code: string | null };
type Booking = { id: string; booked_by_name: string; booked_by_phone: string | null; purpose: string | null; start_time: string; end_time: string; status: string; rejection_reason: string | null; facility_name: string };

const CAT_LABEL: Record<string, string> = { gotong_royong: "Gotong Royong", olahraga: "Olahraga", keagamaan: "Keagamaan", pemuda: "Pemuda", pkk: "PKK", karang_taruna: "Karang Taruna", kelompok_tani: "Kelompok Tani", umum: "Umum" };
const FAC_LABEL: Record<string, string> = { balai_desa: "Balai Desa", aula: "Aula", lapangan: "Lapangan", kendaraan: "Kendaraan", alat: "Alat", lainnya: "Lainnya" };
const BOOK_STATUS: Record<string, "success" | "warning" | "destructive" | "muted"> = { pending: "warning", approved: "success", rejected: "destructive", done: "muted", cancelled: "muted" };

export function CommunityClient() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"events" | "facilities">("events");
  const [events, setEvents] = React.useState<Event[] | null>(null);
  const [facilities, setFacilities] = React.useState<Facility[]>([]);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [eventOpen, setEventOpen] = React.useState(false);
  const [registerOpen, setRegisterOpen] = React.useState<Event | null>(null);
  const [facilityOpen, setFacilityOpen] = React.useState(false);
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [eventForm, setEventForm] = React.useState({ title: "", category: "umum", description: "", startTime: "", locationText: "", organizer: "", needsVolunteers: false, volunteerTarget: "0" });
  const [registerForm, setRegisterForm] = React.useState({ participantName: "", isVolunteer: false });
  const [facilityForm, setFacilityForm] = React.useState({ name: "", facilityType: "balai_desa", capacity: "" });
  const [bookingForm, setBookingForm] = React.useState({ facilityId: "", bookedByName: "", purpose: "", startTime: "", endTime: "" });

  const load = React.useCallback(async () => {
    const view = tab === "events" ? "events" : "facilities";
    const res = await fetch(`/api/community?view=${view}`);
    const json = await res.json();
    if (!json.ok) { toast(json.error ?? "Gagal memuat", "error"); return; }
    if (tab === "events") setEvents(json.data.events);
    else { setFacilities(json.data.facilities); setBookings(json.data.bookings); }
  }, [tab, toast]);
  React.useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>, okMsg: string, close: () => void) {
    setSaving(true);
    const res = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setSaving(false);
    if (json.ok) { toast(okMsg, "success"); close(); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  async function act(bookingId: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/community", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, action, ...extra }) });
    const json = await res.json();
    if (json.ok) { toast("Status booking diperbarui", "success"); load(); }
    else toast(json.error ?? "Gagal", "error");
  }

  return (
    <div>
      <PageHeader
        title="Komunitas & Fasilitas"
        description="Kalender kegiatan desa, relawan, dan peminjaman fasilitas"
        actions={
          tab === "events"
            ? <Button onClick={() => setEventOpen(true)}><Plus className="h-4 w-4" /> Kegiatan Baru</Button>
            : <div className="flex gap-2">
                <Button variant="outline" onClick={() => setBookingOpen(true)}><Plus className="h-4 w-4" /> Booking</Button>
                <Button onClick={() => setFacilityOpen(true)}><Plus className="h-4 w-4" /> Fasilitas</Button>
              </div>
        }
      />

      <div className="mb-4 flex gap-1 rounded-xl border p-1 w-fit">
        {(["events", "facilities"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={"rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " + (tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t === "events" ? "Kegiatan & Relawan" : "Fasilitas & Booking"}
          </button>
        ))}
      </div>

      {tab === "events" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total Kegiatan" value={String(events?.length ?? 0)} icon={<CalendarDays className="h-5 w-5" />} />
            <StatCard label="Butuh Relawan" value={String((events ?? []).filter((e) => e.needs_volunteers).length)} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Total Pendaftar" value={String((events ?? []).reduce((a, e) => a + e.registered_count, 0))} icon={<ClipboardCheck className="h-5 w-5" />} />
          </div>
          <Card className="mt-4">
            <CardHeader><CardTitle>Daftar Kegiatan</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {events === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
              ) : events.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Belum ada kegiatan" />
              ) : (
                <div className="space-y-2">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{e.title} <Badge variant="muted">{CAT_LABEL[e.category] ?? e.category}</Badge></p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(e.start_time).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                          {e.location_text ? ` · ${e.location_text}` : ""}{e.organizer ? ` · ${e.organizer}` : ""}
                        </p>
                        {e.needs_volunteers && (
                          <p className="mt-1 text-xs text-warning">
                            Butuh relawan: {e.volunteer_count}/{e.volunteer_target}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={e.is_public ? "success" : "muted"}>{e.registered_count} pendaftar</Badge>
                        <Button size="sm" variant="outline" onClick={() => { setRegisterOpen(e); setRegisterForm({ participantName: "", isVolunteer: false }); }}>Daftar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "facilities" && (
        <>
          <Card>
            <CardHeader><CardTitle>Fasilitas Desa</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {facilities.length === 0 ? (
                <EmptyState icon={Building} title="Belum ada fasilitas" />
              ) : (
                <DataTable
                  rows={facilities}
                  columns={[
                    { key: "name", header: "Fasilitas", render: (f) => (<div><p className="font-medium">{f.name}</p><p className="text-xs text-muted-foreground">{FAC_LABEL[f.facility_type] ?? f.facility_type}{f.asset_code ? ` · aset ${f.asset_code}` : ""}</p></div>) },
                    { key: "capacity", header: "Kapasitas", render: (f) => f.capacity ? String(f.capacity) : "-" },
                    { key: "bookable", header: "Status", render: (f) => <Badge variant={f.is_bookable ? "success" : "muted"}>{f.is_bookable ? "Dapat dipinjam" : "Tidak"}</Badge> },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle>Riwayat Booking</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {bookings.length === 0 ? (
                <EmptyState icon={Building} title="Belum ada booking" />
              ) : (
                <DataTable
                  rows={bookings}
                  columns={[
                    { key: "facility", header: "Fasilitas", render: (b) => b.facility_name },
                    { key: "by", header: "Penyewa", render: (b) => (<div><p>{b.booked_by_name}</p><p className="text-xs text-muted-foreground">{b.purpose ?? "-"}</p></div>) },
                    { key: "time", header: "Waktu", render: (b) => `${new Date(b.start_time).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })} - ${new Date(b.end_time).toLocaleString("id-ID", { timeStyle: "short" })}` },
                    { key: "status", header: "Status", render: (b) => <Badge variant={BOOK_STATUS[b.status] ?? "muted"}>{b.status}</Badge> },
                    { key: "actions", header: "", className: "text-right", render: (b) => (
                      <div className="flex justify-end gap-1">
                        {b.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => act(b.id, "approve")}>Setujui</Button>
                            <Button size="sm" variant="ghost" onClick={() => act(b.id, "reject", { rejectionReason: "Tidak tersedia" })} aria-label="Tolak">Tolak</Button>
                          </>
                        )}
                        {b.status === "approved" && <Button size="sm" variant="secondary" onClick={() => act(b.id, "done")}>Selesai</Button>}
                      </div>
                    )},
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Modal open={eventOpen} onClose={() => setEventOpen(false)} title="Kegiatan Baru">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "event", ...eventForm, description: eventForm.description || null, locationText: eventForm.locationText || null, organizer: eventForm.organizer || null, volunteerTarget: Number(eventForm.volunteerTarget) || 0, startTime: new Date(eventForm.startTime).toISOString() }, "Kegiatan dibuat", () => setEventOpen(false)); }} className="space-y-4">
          <div><Label htmlFor="ev-title">Judul</Label><Input id="ev-title" required value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ev-cat">Kategori</Label>
              <Select id="ev-cat" value={eventForm.category} onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}>
                {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="ev-time">Waktu Mulai</Label><Input id="ev-time" type="datetime-local" required value={eventForm.startTime} onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ev-loc">Lokasi</Label><Input id="ev-loc" value={eventForm.locationText} onChange={(e) => setEventForm({ ...eventForm, locationText: e.target.value })} /></div>
            <div><Label htmlFor="ev-org">Penyelenggara</Label><Input id="ev-org" value={eventForm.organizer} onChange={(e) => setEventForm({ ...eventForm, organizer: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={eventForm.needsVolunteers} onChange={(e) => setEventForm({ ...eventForm, needsVolunteers: e.target.checked })} className="accent-primary" />
            Butuh relawan
          </label>
          {eventForm.needsVolunteers && (
            <div><Label htmlFor="ev-target">Target Relawan</Label><Input id="ev-target" type="number" min="1" value={eventForm.volunteerTarget} onChange={(e) => setEventForm({ ...eventForm, volunteerTarget: e.target.value })} /></div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEventOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!registerOpen} onClose={() => setRegisterOpen(null)} title={`Daftar: ${registerOpen?.title ?? ""}`}>
        <form onSubmit={(e) => { e.preventDefault(); if (registerOpen) post({ mode: "register", eventId: registerOpen.id, participantName: registerForm.participantName, isVolunteer: registerForm.isVolunteer }, "Terdaftar", () => setRegisterOpen(null)); }} className="space-y-4">
          <div><Label htmlFor="rg-name">Nama Peserta</Label><Input id="rg-name" required value={registerForm.participantName} onChange={(e) => setRegisterForm({ ...registerForm, participantName: e.target.value })} /></div>
          {registerOpen?.needs_volunteers && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={registerForm.isVolunteer} onChange={(e) => setRegisterForm({ ...registerForm, isVolunteer: e.target.checked })} className="accent-primary" />
              Daftar sebagai relawan
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRegisterOpen(null)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Mendaftarkan..." : "Daftar"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={facilityOpen} onClose={() => setFacilityOpen(false)} title="Fasilitas Baru">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "facility", ...facilityForm, capacity: facilityForm.capacity ? Number(facilityForm.capacity) : null }, "Fasilitas ditambahkan", () => setFacilityOpen(false)); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="fc-name">Nama</Label><Input id="fc-name" required value={facilityForm.name} onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })} /></div>
            <div>
              <Label htmlFor="fc-type">Jenis</Label>
              <Select id="fc-type" value={facilityForm.facilityType} onChange={(e) => setFacilityForm({ ...facilityForm, facilityType: e.target.value })}>
                {Object.entries(FAC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
          <div><Label htmlFor="fc-cap">Kapasitas</Label><Input id="fc-cap" type="number" min="0" value={facilityForm.capacity} onChange={(e) => setFacilityForm({ ...facilityForm, capacity: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFacilityOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={bookingOpen} onClose={() => setBookingOpen(false)} title="Booking Fasilitas">
        <form onSubmit={(e) => { e.preventDefault(); post({ mode: "booking", ...bookingForm, purpose: bookingForm.purpose || null, startTime: new Date(bookingForm.startTime).toISOString(), endTime: new Date(bookingForm.endTime).toISOString() }, "Booking dibuat (menunggu persetujuan)", () => setBookingOpen(false)); }} className="space-y-4">
          <div>
            <Label htmlFor="bk-fac">Fasilitas</Label>
            <Select id="bk-fac" required value={bookingForm.facilityId} onChange={(e) => setBookingForm({ ...bookingForm, facilityId: e.target.value })}>
              <option value="">Pilih fasilitas</option>
              {facilities.filter((f) => f.is_bookable).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="bk-name">Nama Penyewa</Label><Input id="bk-name" required value={bookingForm.bookedByName} onChange={(e) => setBookingForm({ ...bookingForm, bookedByName: e.target.value })} /></div>
            <div><Label htmlFor="bk-purpose">Keperluan</Label><Input id="bk-purpose" value={bookingForm.purpose} onChange={(e) => setBookingForm({ ...bookingForm, purpose: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="bk-start">Mulai</Label><Input id="bk-start" type="datetime-local" required value={bookingForm.startTime} onChange={(e) => setBookingForm({ ...bookingForm, startTime: e.target.value })} /></div>
            <div><Label htmlFor="bk-end">Selesai</Label><Input id="bk-end" type="datetime-local" required value={bookingForm.endTime} onChange={(e) => setBookingForm({ ...bookingForm, endTime: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBookingOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Booking"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
