// Simplified landing for Seasonal Labor + Year Round Labor. No tasks, no hub —
// just the four things they need: announcement, work hours, message Trish, request vacation.
import React, { useState, useMemo } from "react";
import { useAuth } from "./Auth";
import { useAnnouncements, useVacationRequests } from "./supabase";
import { VacationRequestModal, OutThisWeekBanner } from "./Vacation";
import { HrComposeModal } from "./HrMessages";
import { AnnouncementBanner, AnnouncementPopup, useAnnouncementPopup } from "./Announcements";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

function isLastWednesdayOfMonth(date = new Date()) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const lastWed = new Date(last);
  while (lastWed.getDay() !== 3) lastWed.setDate(lastWed.getDate() - 1);
  return date.getDate() === lastWed.getDate();
}
function daysUntilLastWednesdayOfMonth(date = new Date()) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const lastWed = new Date(last);
  while (lastWed.getDay() !== 3) lastWed.setDate(lastWed.getDate() - 1);
  if (lastWed < date) {
    // Already passed this month — use next month's
    const nextLast = new Date(date.getFullYear(), date.getMonth() + 2, 0);
    while (nextLast.getDay() !== 3) nextLast.setDate(nextLast.getDate() - 1);
    return { date: nextLast, days: Math.ceil((nextLast - date) / 86400000) };
  }
  return { date: lastWed, days: Math.ceil((lastWed - date) / 86400000) };
}

export default function LaborView({ onSwitchMode }) {
  const { displayName, growerProfile } = useAuth();
  const { rows: announcements } = useAnnouncements();
  const { rows: vacationReqs } = useVacationRequests();
  const [showVacation, setShowVacation] = useState(false);
  const [showHrCompose, setShowHrCompose] = useState(false);
  const announcementPopup = useAnnouncementPopup();

  const activeAnnouncements = useMemo(() =>
    (announcements || []).filter(a => a.active && (!a.expiresAt || new Date(a.expiresAt) > new Date())),
    [announcements]
  );

  // Vacation requests from this user
  const myRequests = useMemo(() =>
    (vacationReqs || []).filter(v => v.requesterName === displayName)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [vacationReqs, displayName]
  );

  const meeting = daysUntilLastWednesdayOfMonth();
  const lang = growerProfile?.language || "en";
  const tr = {
    en: { hi: "Hi", workHours: "Work Hours", workHoursValue: "8:00 AM – 4:30 PM, Mon–Fri", thisWeek: "This week", thisWeeksAnnouncement: "Announcements", noAnnouncement: "No announcements this week.", staffMeeting: "Staff Meeting", nextStaffMeeting: "Next staff meeting", today: "today!", inDays: (d) => `in ${d} day${d !== 1 ? "s" : ""}`, requestTimeOff: "🌴 Request Time Off", messageTrish: "✉ Message Trish (HR)", yourRequests: "Your time-off requests", pending: "Pending", approved: "Approved", declined: "Declined", signOut: "Sign out" },
    es: { hi: "Hola", workHours: "Horario de trabajo", workHoursValue: "8:00 AM – 4:30 PM, Lun a Vie", thisWeek: "Esta semana", thisWeeksAnnouncement: "Anuncios", noAnnouncement: "No hay anuncios esta semana.", staffMeeting: "Reunión de personal", nextStaffMeeting: "Próxima reunión", today: "¡hoy!", inDays: (d) => `en ${d} día${d !== 1 ? "s" : ""}`, requestTimeOff: "🌴 Pedir tiempo libre", messageTrish: "✉ Mensaje a Trish (RH)", yourRequests: "Sus solicitudes de tiempo libre", pending: "Pendiente", approved: "Aprobada", declined: "Rechazada", signOut: "Salir" },
    my: { hi: "မင်္ဂလာပါ", workHours: "အလုပ်ချိန်", workHoursValue: "8:00 AM – 4:30 PM, တနင်္လာ - သောကြာ", thisWeek: "ဤအပတ်", thisWeeksAnnouncement: "ကြေငြာချက်များ", noAnnouncement: "ဤအပတ်တွင် ကြေငြာချက်မရှိပါ။", staffMeeting: "ဝန်ထမ်းအစည်းအဝေး", nextStaffMeeting: "နောက်အစည်းအဝေး", today: "ယနေ့!", inDays: (d) => `${d} ရက်အကြာ`, requestTimeOff: "🌴 ခွင့်တောင်းခံပါ", messageTrish: "✉ Trish ထံ စာပို့ပါ (HR)", yourRequests: "သင်၏ ခွင့်တောင်းခံချက်များ", pending: "စောင့်ဆိုင်းနေ", approved: "ခွင့်ပြုပြီး", declined: "ငြင်းပယ်", signOut: "ထွက်ပါ" },
  }[lang] || {};

  return (
    <div lang={lang} style={{ ...FONT, minHeight: "100vh", background: "#1e2d1a", color: "#c8e6b8", paddingBottom: 50 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(127, 176, 105, 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 700, letterSpacing: 1 }}>{tr.hi}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "'DM Serif Display',Georgia,serif" }}>{(displayName || "").split(" ")[0]}</div>
        </div>
        <button onClick={onSwitchMode}
          style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ↩ {tr.signOut}
        </button>
      </div>

      <AnnouncementBanner />
      <OutThisWeekBanner />

      <div style={{ padding: 14 }}>
        {/* Big primary actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <button onClick={() => setShowVacation(true)}
            style={{ background: "#7fb069", border: "none", borderRadius: 16, padding: "26px 12px", color: "#1e2d1a", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3 }}>
            {tr.requestTimeOff}
          </button>
          <button onClick={() => setShowHrCompose(true)}
            style={{ background: "#8e44ad", border: "none", borderRadius: 16, padding: "26px 12px", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3 }}>
            {tr.messageTrish}
          </button>
        </div>

        {/* Work hours */}
        <div style={{ background: "#162212", border: "1px solid rgba(127, 176, 105, 0.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{tr.workHours}</div>
          <div style={{ fontSize: 17, color: "#fff", fontWeight: 700, marginTop: 4 }}>{tr.workHoursValue}</div>
        </div>

        {/* Staff meeting reminder */}
        <div style={{ background: meeting.days <= 3 ? "#7a5a00" : "#162212", border: "1px solid rgba(127, 176, 105, 0.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: meeting.days <= 3 ? "#ffdd99" : "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{tr.staffMeeting}</div>
          <div style={{ fontSize: 15, color: "#fff", fontWeight: 700, marginTop: 4 }}>
            {tr.nextStaffMeeting}: {meeting.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            <span style={{ marginLeft: 8, fontSize: 12, color: meeting.days <= 3 ? "#ffdd99" : "#7a9a6a" }}>
              ({meeting.days === 0 ? tr.today : tr.inDays(meeting.days)})
            </span>
          </div>
        </div>

        {/* Announcements */}
        <div style={{ background: "#162212", border: "1px solid rgba(127, 176, 105, 0.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{tr.thisWeeksAnnouncement}</div>
          {activeAnnouncements.length === 0 ? (
            <div style={{ fontSize: 13, color: "#7a9a6a", marginTop: 6 }}>{tr.noAnnouncement}</div>
          ) : (
            activeAnnouncements.map(a => (
              <div key={a.id} style={{ borderLeft: `3px solid ${a.priority === "urgent" ? "#d94f3d" : "#7fb069"}`, paddingLeft: 10, marginTop: 8 }}>
                <div style={{ fontSize: 14, color: "#fff", whiteSpace: "pre-wrap" }}>{a.priority === "urgent" ? "🚨 " : ""}{a.message}</div>
                <div style={{ fontSize: 10, color: "#7a9a6a", marginTop: 4 }}>— {a.postedBy}</div>
              </div>
            ))
          )}
        </div>

        {/* My vacation request status */}
        {myRequests.length > 0 && (
          <div style={{ background: "#162212", border: "1px solid rgba(127, 176, 105, 0.3)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{tr.yourRequests}</div>
            {myRequests.slice(0, 5).map(v => (
              <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13, borderBottom: "1px solid rgba(127, 176, 105, 0.15)" }}>
                <span style={{ color: "#fff" }}>{v.startDate}{v.endDate !== v.startDate ? ` → ${v.endDate}` : ""}{v.isSick ? " 🤒" : ""}</span>
                <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                  background: v.status === "approved" ? "#7fb069" : v.status === "declined" ? "#d94f3d" : "#e89a3a",
                  color: v.status === "approved" ? "#1e2d1a" : "#fff" }}>
                  {v.status === "approved" ? tr.approved : v.status === "declined" ? tr.declined : tr.pending}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showVacation && <VacationRequestModal onCancel={() => setShowVacation(false)} onSaved={() => setShowVacation(false)} />}
      {showHrCompose && <HrComposeModal onClose={() => setShowHrCompose(false)} onSent={() => setShowHrCompose(false)} />}
      {announcementPopup.open && <AnnouncementPopup unseen={announcementPopup.unseen} onClose={announcementPopup.close} />}
    </div>
  );
}
