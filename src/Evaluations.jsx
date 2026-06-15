import { useMemo, useState } from "react";
import { getSupabase, useEmployeeEvaluations, useEvaluationAssignments, useFloorCodes2 } from "./supabase";
import { useAuth } from "./Auth";

const COLORS = {
  dark: "#1e2d1a",
  green: "#7fb069",
  cream: "#c8e6b8",
  muted: "#7a8c74",
  red: "#d94f3d",
  amber: "#e89a3a",
  border: "#dbe6d5",
  bg: "#f2f5ef",
};

const EMPLOYEE_CRITERIA = [
  ["jobKnowledge", "Job knowledge"],
  ["quality", "Quality and accuracy"],
  ["productivity", "Productivity and pace"],
  ["reliability", "Reliability and attendance"],
  ["communication", "Communication"],
  ["teamwork", "Teamwork"],
  ["initiative", "Initiative and problem solving"],
  ["safety", "Safety and care of equipment"],
];

const EMPLOYER_CRITERIA = [
  ["communication", "Communication from management"],
  ["training", "Training and job preparation"],
  ["tools", "Tools, equipment, and resources"],
  ["respect", "Respect and fairness"],
  ["teamwork", "Team environment"],
  ["safety", "Workplace safety"],
  ["recognition", "Recognition and feedback"],
  ["overall", "Overall workplace experience"],
];

const LANGUAGE_LABELS = { en: "English", es: "Español", my: "မြန်မာ" };

const SELF_COPY = {
  en: {
    title: "Employer / Self Evaluation",
    subtitle: "Give honest feedback about your work experience, management, and what would help you succeed.",
    scale: "1 = needs attention · 3 = okay · 5 = excellent",
    criteria: ["Communication from management", "Training and job preparation", "Tools, equipment, and resources", "Respect and fairness", "Team environment", "Workplace safety", "Recognition and feedback", "Overall workplace experience"],
    working: "What is working well?",
    workingPlaceholder: "What should the company or manager continue doing?",
    concerns: "Concerns or obstacles",
    concernsPlaceholder: "Workload, communication, safety, scheduling, team issues, or anything else.",
    feedback: "Feedback for management",
    feedbackPlaceholder: "What could your manager do differently or more consistently?",
    changes: "Changes or resources requested",
    changesPlaceholder: "Training, tools, role clarity, schedule, process changes, etc.",
    goals: "Your career or development goals",
    acknowledgeTitle: "Acknowledgement",
    acknowledgeSubtitle: "Checking this confirms these are your responses and you are ready to submit them.",
    acknowledge: "I confirm this is my employer/self evaluation.",
    submit: "Submit Evaluation",
    required: "Confirm the acknowledgement before submitting.",
  },
  es: {
    title: "Evaluación del empleador / Autoevaluación",
    subtitle: "Comparta comentarios honestos sobre su experiencia laboral, la gerencia y lo que le ayudaría a tener éxito.",
    scale: "1 = necesita atención · 3 = está bien · 5 = excelente",
    criteria: ["Comunicación de la gerencia", "Capacitación y preparación para el trabajo", "Herramientas, equipo y recursos", "Respeto y trato justo", "Ambiente de equipo", "Seguridad en el trabajo", "Reconocimiento y comentarios", "Experiencia laboral en general"],
    working: "¿Qué está funcionando bien?",
    workingPlaceholder: "¿Qué debería seguir haciendo la empresa o su gerente?",
    concerns: "Inquietudes u obstáculos",
    concernsPlaceholder: "Carga de trabajo, comunicación, seguridad, horario, problemas del equipo u otra inquietud.",
    feedback: "Comentarios para la gerencia",
    feedbackPlaceholder: "¿Qué podría hacer su gerente de manera diferente o más constante?",
    changes: "Cambios o recursos solicitados",
    changesPlaceholder: "Capacitación, herramientas, claridad de funciones, horario, cambios de proceso, etc.",
    goals: "Sus metas profesionales o de desarrollo",
    acknowledgeTitle: "Confirmación",
    acknowledgeSubtitle: "Marque esta casilla para confirmar que estas son sus respuestas y que está listo para enviarlas.",
    acknowledge: "Confirmo que esta es mi evaluación del empleador/autoevaluación.",
    submit: "Enviar evaluación",
    required: "Confirme la casilla antes de enviar.",
  },
  my: {
    title: "အလုပ်ရှင် / ကိုယ်တိုင် အကဲဖြတ်ချက်",
    subtitle: "သင့်အလုပ်အတွေ့အကြုံ၊ စီမံခန့်ခွဲမှုနှင့် အောင်မြင်ရန် လိုအပ်သောအရာများကို ရိုးသားစွာ မျှဝေပါ။",
    scale: "၁ = ပြင်ဆင်ရန်လို · ၃ = ကောင်းမွန် · ၅ = အလွန်ကောင်း",
    criteria: ["စီမံခန့်ခွဲမှုမှ ဆက်သွယ်ရေး", "သင်တန်းနှင့် အလုပ်အတွက် ပြင်ဆင်မှု", "ကိရိယာများ၊ စက်ပစ္စည်းများနှင့် အရင်းအမြစ်များ", "လေးစားမှုနှင့် မျှတမှု", "အဖွဲ့လိုက် အလုပ်ပတ်ဝန်းကျင်", "လုပ်ငန်းခွင် ဘေးကင်းရေး", "အသိအမှတ်ပြုမှုနှင့် အကြံပြုချက်", "အလုပ်ခွင် အတွေ့အကြုံ စုစုပေါင်း"],
    working: "ဘာတွေ ကောင်းကောင်း လုပ်ဆောင်နေပါသလဲ။",
    workingPlaceholder: "ကုမ္ပဏီ သို့မဟုတ် မန်နေဂျာက ဘာကို ဆက်လုပ်သင့်ပါသလဲ။",
    concerns: "စိုးရိမ်မှုများ သို့မဟုတ် အခက်အခဲများ",
    concernsPlaceholder: "အလုပ်ပမာဏ၊ ဆက်သွယ်ရေး၊ ဘေးကင်းရေး၊ အချိန်ဇယား၊ အဖွဲ့ပြဿနာများ သို့မဟုတ် အခြားအရာများ။",
    feedback: "စီမံခန့်ခွဲမှုအတွက် အကြံပြုချက်",
    feedbackPlaceholder: "သင့်မန်နေဂျာက ဘာကို ကွဲပြားစွာ သို့မဟုတ် ပိုမိုမှန်မှန် လုပ်နိုင်ပါသလဲ။",
    changes: "တောင်းဆိုလိုသော အပြောင်းအလဲများ သို့မဟုတ် အရင်းအမြစ်များ",
    changesPlaceholder: "သင်တန်း၊ ကိရိယာ၊ တာဝန်ရှင်းလင်းမှု၊ အချိန်ဇယား သို့မဟုတ် လုပ်ငန်းစဉ် အပြောင်းအလဲများ။",
    goals: "သင့်အလုပ်အကိုင် သို့မဟုတ် တိုးတက်ရေး ရည်မှန်းချက်များ",
    acknowledgeTitle: "အတည်ပြုချက်",
    acknowledgeSubtitle: "ဤအဖြေများသည် သင့်အဖြေများဖြစ်ပြီး ပေးပို့ရန် အဆင်သင့်ဖြစ်ကြောင်း အတည်ပြုပါ။",
    acknowledge: "ဤအလုပ်ရှင်/ကိုယ်တိုင် အကဲဖြတ်ချက်သည် ကျွန်ုပ်၏အဖြေဖြစ်ကြောင်း အတည်ပြုပါသည်။",
    submit: "အကဲဖြတ်ချက် ပေးပို့ပါ",
    required: "မပေးပို့မီ အတည်ပြုချက်ကို ရွေးပါ။",
  },
};

async function translateFields(fields, target) {
  const entries = Object.entries(fields).filter(([, value]) => String(value || "").trim());
  if (!entries.length || target === "en") return fields;
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: entries.map(([, value]) => value), target, context: "evaluation" }),
  });
  if (!response.ok) throw new Error("Translation service is unavailable. Please try again.");
  const data = await response.json();
  return Object.fromEntries(entries.map(([key], index) => [key, data.translations?.[index] || ""]));
}

const EMPTY_FORM = {
  employeeId: "",
  employeeName: "",
  employeeRole: "",
  department: "",
  reviewYear: new Date().getFullYear(),
  reviewDate: new Date().toISOString().slice(0, 10),
  status: "draft",
  managerStatus: "pending",
  employeeStatus: "pending",
  managerRatings: {},
  strengths: "",
  improvementAreas: "",
  goals: "",
  managerSupport: "",
  attendanceNotes: "",
  employerRatings: {},
  employeeLikes: "",
  employeeConcerns: "",
  managementFeedback: "",
  requestedChanges: "",
  employeeGoals: "",
  followUpDate: "",
  followUpNotes: "",
  managerAcknowledged: false,
  employeeAcknowledged: false,
  managerAcknowledgedAt: null,
  employeeAcknowledgedAt: null,
  completedAt: null,
  managerCompletedAt: null,
  employeeSubmittedAt: null,
};

function selfEvaluationForm(displayName, growerProfile) {
  return {
    ...EMPTY_FORM,
    employeeName: growerProfile?.name || displayName || "",
    employeeRole: growerProfile?.title || growerProfile?.role || "",
    department: growerProfile?.group || growerProfile?.department || "",
    evaluatorName: displayName || growerProfile?.name || "",
  };
}

function average(ratings) {
  const values = Object.values(ratings || {}).map(Number).filter(Boolean);
  if (!values.length) return null;
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ color: COLORS.dark, fontWeight: 800, fontSize: 13, marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 5 }}>{hint}</div>}
    </label>
  );
}

function TextArea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%", boxSizing: "border-box", resize: "vertical",
        border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
        padding: "11px 12px", fontFamily: "inherit", fontSize: 14,
        color: COLORS.dark, background: "#fff",
      }}
    />
  );
}

function RatingGrid({ criteria, ratings, onChange, scaleLabel }) {
  return (
    <div style={{ border: `1.5px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 18 }}>
      <div style={{ padding: "9px 12px", background: "#edf4e9", color: COLORS.muted, fontSize: 11, fontWeight: 800 }}>
        {scaleLabel || "1 = needs attention · 3 = meets expectations · 5 = exceptional"}
      </div>
      {criteria.map(([key, label], index) => (
        <div key={key} style={{ padding: "11px 12px", borderTop: index ? `1px solid ${COLORS.border}` : "none", background: "#fff" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.dark, marginBottom: 8 }}>{label}</div>
          <div style={{ display: "flex", gap: 7 }}>
            {[1, 2, 3, 4, 5].map(value => {
              const selected = Number(ratings?.[key]) === value;
              return (
                <button key={value} type="button" onClick={() => onChange({ ...(ratings || {}), [key]: value })}
                  style={{
                    flex: 1, height: 36, borderRadius: 8, fontWeight: 800, fontFamily: "inherit",
                    border: `1.5px solid ${selected ? COLORS.dark : COLORS.border}`,
                    background: selected ? COLORS.green : "#fff",
                    color: COLORS.dark, cursor: "pointer",
                  }}>
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${COLORS.border}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 20, color: COLORS.dark, fontWeight: 800 }}>{title}</div>
      {subtitle && <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 3, marginBottom: 16 }}>{subtitle}</div>}
      {!subtitle && <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

function PageHeader({ title, subtitle, onBack }) {
  return (
    <div style={{ background: COLORS.dark, color: COLORS.cream, padding: "12px 14px", position: "sticky", top: 0, zIndex: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: COLORS.cream, padding: "7px 10px", fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
          ← Back
        </button>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 20, fontWeight: 800 }}>{title}</div>
          {subtitle && <div style={{ color: "#8eaa82", fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

export default function Evaluations({ onBack, selfOnly = false }) {
  const { displayName, growerProfile } = useAuth();
  const canViewAll = growerProfile?.code === "9999999";
  const { rows, insert, update, loading, error } = useEmployeeEvaluations({ loadRows: canViewAll });
  const { rows: assignments, upsert: upsertAssignment, remove: removeAssignment } = useEvaluationAssignments();
  const { rows: floorCodes } = useFloorCodes2();
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState(() => canViewAll ? "employee" : "employer");
  const [evaluationMode, setEvaluationMode] = useState(canViewAll ? "owner" : "self");
  const [ownerTab, setOwnerTab] = useState("reviews");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());

  const employees = useMemo(() => {
    const excludedRoles = new Set(["driver", "seasonal_driver"]);
    const byName = new Map();
    for (const person of floorCodes || []) {
      if (!person.active || !person.workerName || excludedRoles.has((person.role || "").toLowerCase())) continue;
      if (!byName.has(person.workerName)) byName.set(person.workerName, person);
    }
    return [...byName.values()].sort((a, b) => a.workerName.localeCompare(b.workerName));
  }, [floorCodes]);

  const managers = useMemo(() => employees.filter(person =>
    ["manager", "assistant_manager", "operations_manager"].includes((person.role || "").toLowerCase())
  ), [employees]);

  const myAssignments = useMemo(() => (assignments || []).filter(row =>
    Number(row.reviewYear) === Number(yearFilter) && row.managerName === displayName
  ), [assignments, displayName, yearFilter]);

  const filtered = useMemo(() => (rows || [])
    .filter(row => Number(row.reviewYear) === Number(yearFilter))
    .sort((a, b) => (a.employeeName || "").localeCompare(b.employeeName || "")), [rows, yearFilter]);

  function startNew() {
    setEditing({ ...EMPTY_FORM, evaluatorName: displayName || "" });
    setTab("employee");
    setSaveError("");
  }

  function startSelfEvaluation() {
    setEvaluationMode("self");
    setEditing(selfEvaluationForm(displayName, growerProfile));
    setTab("employer");
    setSaveError("");
  }

  async function startAssignedEvaluation(assignment) {
    setSaving(true);
    setSaveError("");
    try {
      const db = getSupabase();
      let existing = null;
      if (db) {
        const { data, error: fetchError } = await db
          .from("employee_evaluations")
          .select("*")
          .eq("employee_name", assignment.employeeName)
          .eq("review_year", assignment.reviewYear)
          .maybeSingle();
        if (fetchError) throw fetchError;
        existing = data;
      }
      setEvaluationMode("assigned");
      setTab("employee");
      setEditing({
        ...EMPTY_FORM,
        ...(existing ? {
          ...existing,
          employeeId: existing.employee_id,
          employeeName: existing.employee_name,
          employeeRole: existing.employee_role,
          reviewYear: existing.review_year,
          reviewDate: existing.review_date,
          managerStatus: existing.manager_status,
          employeeStatus: existing.employee_status,
          managerRatings: existing.manager_ratings || {},
          employerRatings: existing.employer_ratings || {},
          employerResponsesEn: existing.employer_responses_en || {},
          managerResponsesTranslated: existing.manager_responses_translated || {},
          employeeLikes: existing.employee_likes || "",
          employeeConcerns: existing.employee_concerns || "",
          managementFeedback: existing.management_feedback || "",
          requestedChanges: existing.requested_changes || "",
          employeeGoals: existing.employee_goals || "",
          strengths: existing.strengths || "",
          improvementAreas: existing.improvement_areas || "",
          goals: existing.goals || "",
          managerSupport: existing.manager_support || "",
          attendanceNotes: existing.attendance_notes || "",
          responseLanguage: existing.response_language || assignment.employeeLanguage || "en",
        } : {}),
        employeeName: assignment.employeeName,
        employeeRole: assignment.employeeRole || "",
        department: assignment.employeeDepartment || "",
        reviewYear: assignment.reviewYear,
        assignedManagerName: assignment.managerName,
        evaluatorName: displayName || "",
        responseLanguage: existing?.response_language || assignment.employeeLanguage || "en",
      });
    } catch (e) {
      setSaveError(e.message || "Could not open the assigned evaluation.");
    } finally {
      setSaving(false);
    }
  }

  async function assignEmployee(person, managerName) {
    const existing = (assignments || []).find(row =>
      Number(row.reviewYear) === Number(yearFilter) && row.employeeName === person.workerName
    );
    if (!managerName) {
      if (existing?.id) await removeAssignment(existing.id);
      return;
    }
    await upsertAssignment({
      ...(existing || {}),
      reviewYear: yearFilter,
      employeeName: person.workerName,
      employeeRole: person.title || person.role || "",
      employeeDepartment: person.staffGroup || person.department || "",
      employeeLanguage: person.language || "en",
      managerName,
      assignedBy: displayName || "Paul Schlegel",
      assignedAt: new Date().toISOString(),
    });
  }

  function chooseEmployee(id) {
    const person = employees.find(item => item.id === id);
    const assignment = (assignments || []).find(row =>
      Number(row.reviewYear) === Number(editing?.reviewYear || yearFilter) && row.employeeName === person?.workerName
    );
    setEditing(current => ({
      ...current,
      employeeId: id,
      employeeName: person?.workerName || "",
      employeeRole: person?.title || person?.role || "",
      department: person?.staffGroup || person?.department || "",
      responseLanguage: person?.language || "en",
      assignedManagerName: assignment?.managerName || "",
    }));
  }

  async function save(status = "draft") {
    if (!editing.employeeName) {
      setSaveError("Choose an employee before saving.");
      return;
    }
    const language = growerProfile?.language || "en";
    const selfCopy = SELF_COPY[language] || SELF_COPY.en;
    if (evaluationMode === "self" && !editing.employeeAcknowledged) {
      setSaveError(selfCopy.required);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const now = new Date().toISOString();
      if (evaluationMode === "self") {
        const db = getSupabase();
        const originalResponses = {
          employeeLikes: editing.employeeLikes,
          employeeConcerns: editing.employeeConcerns,
          managementFeedback: editing.managementFeedback,
          requestedChanges: editing.requestedChanges,
          employeeGoals: editing.employeeGoals,
        };
        const englishResponses = language === "en"
          ? originalResponses
          : await translateFields(originalResponses, "en");
        const employeePayload = {
          employee_name: growerProfile?.name || displayName || editing.employeeName,
          employee_role: growerProfile?.title || growerProfile?.role || editing.employeeRole || null,
          department: growerProfile?.group || growerProfile?.department || editing.department || null,
          evaluator_name: displayName || growerProfile?.name || editing.evaluatorName,
          review_year: editing.reviewYear,
          review_date: editing.reviewDate,
          employer_ratings: editing.employerRatings || {},
          employee_likes: editing.employeeLikes || null,
          employee_concerns: editing.employeeConcerns || null,
          management_feedback: editing.managementFeedback || null,
          requested_changes: editing.requestedChanges || null,
          employee_goals: editing.employeeGoals || null,
          employee_acknowledged: !!editing.employeeAcknowledged,
          employee_acknowledged_at: editing.employeeAcknowledged ? now : null,
          employee_status: "completed",
          employee_submitted_at: now,
          response_language: language,
          employer_responses_en: englishResponses,
        };
        if (db) {
          const { data: existing, error: findError } = await db
            .from("employee_evaluations")
            .select("id")
            .eq("employee_name", employeePayload.employee_name)
            .eq("review_year", employeePayload.review_year)
            .maybeSingle();
          if (findError) throw findError;
          const query = existing?.id
            ? db.from("employee_evaluations").update(employeePayload).eq("id", existing.id)
            : db.from("employee_evaluations").insert(employeePayload);
          const { error: saveEmployeeError } = await query;
          if (saveEmployeeError) throw saveEmployeeError;
        } else {
          await insert({
            ...editing,
            employeeName: employeePayload.employee_name,
            employeeRole: employeePayload.employee_role,
            department: employeePayload.department,
            employeeStatus: "completed",
            employeeSubmittedAt: now,
          });
        }
        setEditing(null);
        setSubmitted(true);
        return;
      }
      const managerNarrative = {
        strengths: editing.strengths,
        improvementAreas: editing.improvementAreas,
        goals: editing.goals,
        managerSupport: editing.managerSupport,
        attendanceNotes: editing.attendanceNotes,
      };
      const targetLanguage = editing.responseLanguage || "en";
      const translatedManagerNarrative = targetLanguage === "en"
        ? managerNarrative
        : await translateFields(managerNarrative, targetLanguage);
      const payload = {
        ...editing,
        evaluatorName: editing.evaluatorName || displayName || "",
        assignedManagerName: editing.assignedManagerName || (evaluationMode === "assigned" ? displayName : null),
        status,
        managerStatus: status,
        managerResponsesTranslated: translatedManagerNarrative,
        managerCompletedAt: status === "completed" ? (editing.managerCompletedAt || now) : null,
        completedAt: status === "completed" ? (editing.completedAt || now) : null,
        managerAcknowledgedAt: editing.managerAcknowledged && !editing.managerAcknowledgedAt ? now : editing.managerAcknowledgedAt,
        employeeAcknowledgedAt: editing.employeeAcknowledged && !editing.employeeAcknowledgedAt ? now : editing.employeeAcknowledgedAt,
      };
      if (editing.id) {
        await update(editing.id, payload);
      } else {
        const db = getSupabase();
        if (db) {
          const { data: existing, error: findError } = await db
            .from("employee_evaluations")
            .select("id")
            .eq("employee_name", editing.employeeName)
            .eq("review_year", editing.reviewYear)
            .maybeSingle();
          if (findError) throw findError;
          if (existing?.id) await update(existing.id, payload);
          else await insert(payload);
        } else {
          await insert(payload);
        }
      }
      setEditing(null);
      if (evaluationMode === "assigned") setSubmitted(true);
    } catch (e) {
      setSaveError(e.message || "Could not save the evaluation.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    const canDoEmployeeEvaluation = canViewAll || evaluationMode === "assigned";
    const language = growerProfile?.language || "en";
    const copy = SELF_COPY[language] || SELF_COPY.en;
    const localizedCriteria = EMPLOYER_CRITERIA.map(([key], index) => [key, copy.criteria[index]]);
    const employeeAverage = average(editing.managerRatings);
    const employerAverage = average(editing.employerRatings);
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 100 }}>
        <PageHeader
          title={editing.id ? editing.employeeName : "New Evaluation"}
          subtitle={`${editing.reviewYear} annual review`}
          onBack={() => setEditing(null)}
        />

        <div style={{ padding: 14 }}>
          <Section title={canDoEmployeeEvaluation ? "Review Details" : copy.title}>
            {canViewAll ? (
              <Field label="Employee">
                <select value={editing.employeeId || ""} onChange={e => chooseEmployee(e.target.value)} disabled={!!editing.id}
                  style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: editing.id ? "#eef1ec" : "#fff", fontFamily: "inherit", fontSize: 14 }}>
                  <option value="">Select employee...</option>
                  {employees.map(person => <option key={person.id} value={person.id}>{person.workerName}</option>)}
                </select>
              </Field>
            ) : (
              <div style={{ background: "#edf4e9", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: COLORS.dark }}>{editing.employeeName}</div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                  {canDoEmployeeEvaluation ? `Assigned employee · ${LANGUAGE_LABELS[editing.responseLanguage || "en"]}` : copy.subtitle}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Review year">
                <input type="number" value={editing.reviewYear} onChange={e => setEditing({ ...editing, reviewYear: Number(e.target.value) })}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontFamily: "inherit" }} />
              </Field>
              <Field label="Meeting date">
                <input type="date" value={editing.reviewDate || ""} onChange={e => setEditing({ ...editing, reviewDate: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontFamily: "inherit" }} />
              </Field>
            </div>
          </Section>

          {canViewAll && (
            <div style={{ display: "flex", background: "#e6eee1", padding: 4, borderRadius: 12, marginBottom: 14 }}>
              <button onClick={() => setTab("employee")} style={{
                flex: 1, border: "none", borderRadius: 9, padding: "11px 6px", fontFamily: "inherit", fontWeight: 800, cursor: "pointer",
                background: tab === "employee" ? COLORS.dark : "transparent", color: tab === "employee" ? COLORS.cream : COLORS.muted,
              }}>Employee Evaluation{employeeAverage ? ` · ${employeeAverage}` : ""}</button>
              <button onClick={() => setTab("employer")} style={{
                flex: 1, border: "none", borderRadius: 9, padding: "11px 6px", fontFamily: "inherit", fontWeight: 800, cursor: "pointer",
                background: tab === "employer" ? COLORS.dark : "transparent", color: tab === "employer" ? COLORS.cream : COLORS.muted,
              }}>Employer / Self Evaluation{employerAverage ? ` · ${employerAverage}` : ""}</button>
            </div>
          )}

          {canDoEmployeeEvaluation && tab === "employee" && (
            <>
              <Section title="Employee Performance" subtitle="Completed by the manager with specific examples where possible.">
                <RatingGrid criteria={EMPLOYEE_CRITERIA} ratings={editing.managerRatings}
                  onChange={managerRatings => setEditing({ ...editing, managerRatings })} />
                <Field label="Strengths and accomplishments">
                  <TextArea value={editing.strengths} onChange={strengths => setEditing({ ...editing, strengths })} placeholder="What went especially well this year?" />
                </Field>
                <Field label="Areas for improvement">
                  <TextArea value={editing.improvementAreas} onChange={improvementAreas => setEditing({ ...editing, improvementAreas })} placeholder="Describe the behavior, impact, and expected improvement." />
                </Field>
                <Field label="Goals before the next review">
                  <TextArea value={editing.goals} onChange={goals => setEditing({ ...editing, goals })} placeholder="List clear, measurable goals and target dates." />
                </Field>
                <Field label="Support the manager will provide">
                  <TextArea value={editing.managerSupport} onChange={managerSupport => setEditing({ ...editing, managerSupport })} placeholder="Training, tools, check-ins, scheduling, or other support." />
                </Field>
                <Field label="Attendance or reliability notes" hint="Use objective dates and facts. Leave blank when there is nothing to document.">
                  <TextArea value={editing.attendanceNotes} onChange={attendanceNotes => setEditing({ ...editing, attendanceNotes })} />
                </Field>
              </Section>
            </>
          )}

          {tab === "employer" && (
            <Section title={canViewAll ? "Employer / Self Evaluation" : copy.title} subtitle={canViewAll ? "Review the employee's feedback about their work experience and management." : copy.subtitle}>
              <RatingGrid criteria={canViewAll ? EMPLOYER_CRITERIA : localizedCriteria} ratings={editing.employerRatings}
                scaleLabel={canViewAll ? undefined : copy.scale}
                onChange={employerRatings => setEditing({ ...editing, employerRatings })} />
              <Field label={canViewAll ? "What is working well?" : copy.working}>
                <TextArea value={editing.employeeLikes} onChange={employeeLikes => setEditing({ ...editing, employeeLikes })} placeholder={canViewAll ? "What should the company or manager continue doing?" : copy.workingPlaceholder} />
              </Field>
              <Field label={canViewAll ? "Concerns or obstacles" : copy.concerns}>
                <TextArea value={editing.employeeConcerns} onChange={employeeConcerns => setEditing({ ...editing, employeeConcerns })} placeholder={canViewAll ? "Workload, communication, safety, scheduling, team issues, or anything else." : copy.concernsPlaceholder} />
              </Field>
              <Field label={canViewAll ? "Feedback for management" : copy.feedback}>
                <TextArea value={editing.managementFeedback} onChange={managementFeedback => setEditing({ ...editing, managementFeedback })} placeholder={canViewAll ? "What could the manager do differently or more consistently?" : copy.feedbackPlaceholder} />
              </Field>
              <Field label={canViewAll ? "Changes or resources requested" : copy.changes}>
                <TextArea value={editing.requestedChanges} onChange={requestedChanges => setEditing({ ...editing, requestedChanges })} placeholder={canViewAll ? "Training, tools, role clarity, schedule, process changes, etc." : copy.changesPlaceholder} />
              </Field>
              <Field label={canViewAll ? "Employee's career or development goals" : copy.goals}>
                <TextArea value={editing.employeeGoals} onChange={employeeGoals => setEditing({ ...editing, employeeGoals })} />
              </Field>
            </Section>
          )}

          {(evaluationMode === "assigned" || canViewAll) && editing.employeeStatus === "completed" && editing.responseLanguage !== "en" && (
            <Section title="Employee Self-Evaluation" subtitle={`Original: ${LANGUAGE_LABELS[editing.responseLanguage || "en"]} · English translation shown below`}>
              {[
                ["What is working well?", "employeeLikes"],
                ["Concerns or obstacles", "employeeConcerns"],
                ["Feedback for management", "managementFeedback"],
                ["Changes or resources requested", "requestedChanges"],
                ["Career or development goals", "employeeGoals"],
              ].map(([label, key]) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.dark }}>{label}</div>
                  {editing.responseLanguage !== "en" && editing[key] && (
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4, padding: 9, background: "#f6f7f4", borderRadius: 8 }}>
                      <strong>Original:</strong> {editing[key]}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: COLORS.dark, marginTop: 4, padding: 9, background: "#edf4e9", borderRadius: 8 }}>
                    {editing.responseLanguage === "en" ? (editing[key] || "No response") : (editing.employerResponsesEn?.[key] || "Translation unavailable")}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {canDoEmployeeEvaluation && <Section title="Follow-up and Acknowledgement" subtitle="Acknowledgement confirms the conversation happened; it does not necessarily mean both people agree with every statement.">
            <Field label="Follow-up date">
              <input type="date" value={editing.followUpDate || ""} onChange={e => setEditing({ ...editing, followUpDate: e.target.value })}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px", borderRadius: 9, border: `1.5px solid ${COLORS.border}`, fontFamily: "inherit" }} />
            </Field>
            <Field label="Follow-up commitments or notes">
              <TextArea value={editing.followUpNotes} onChange={followUpNotes => setEditing({ ...editing, followUpNotes })} />
            </Field>
            {[
              ["managerAcknowledged", `Manager acknowledgement${editing.evaluatorName ? ` · ${editing.evaluatorName}` : ""}`],
              ["employeeAcknowledged", `Employee acknowledgement${editing.employeeName ? ` · ${editing.employeeName}` : ""}`],
            ].map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", color: COLORS.dark, fontSize: 13, fontWeight: 700 }}>
                <input type="checkbox" checked={!!editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.checked })} style={{ width: 20, height: 20 }} />
                <span>{label}</span>
              </label>
            ))}
          </Section>}

          {evaluationMode === "self" && (
            <Section title={copy.acknowledgeTitle} subtitle={copy.acknowledgeSubtitle}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0", color: COLORS.dark, fontSize: 13, fontWeight: 700 }}>
                <input type="checkbox" checked={!!editing.employeeAcknowledged} onChange={e => setEditing({ ...editing, employeeAcknowledged: e.target.checked })} style={{ width: 20, height: 20 }} />
                <span>{copy.acknowledge}</span>
              </label>
            </Section>
          )}

          {saveError && <div style={{ background: "#fff0ed", color: COLORS.red, border: "1px solid #f0b8ad", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>{saveError}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            {(canViewAll || evaluationMode === "assigned") && (
              <button onClick={() => save("draft")} disabled={saving}
                style={{ flex: 1, padding: 13, borderRadius: 11, border: `1.5px solid ${COLORS.dark}`, background: "#fff", color: COLORS.dark, fontFamily: "inherit", fontWeight: 800, cursor: "pointer" }}>
                Save Draft
              </button>
            )}
            <button onClick={() => save("completed")} disabled={saving}
              style={{ flex: canDoEmployeeEvaluation ? 1.3 : 1, padding: 13, borderRadius: 11, border: "none", background: COLORS.green, color: COLORS.dark, fontFamily: "inherit", fontWeight: 900, cursor: "pointer" }}>
              {saving ? "Submitting..." : canDoEmployeeEvaluation ? "Complete Employee Evaluation" : copy.submit}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!canViewAll && submitted) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <PageHeader title="Evaluation Submitted" subtitle="Your response has been recorded" onBack={onBack} />
        <div style={{ padding: 14 }}>
          <div style={{ background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 14, padding: "36px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 38, color: COLORS.green }}>✓</div>
            <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 22, color: COLORS.dark, marginTop: 8 }}>Thank you</div>
            <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
              The evaluation is saved. Only the `9999999` login can view submitted evaluations.
            </div>
            <button onClick={() => {
              setSubmitted(false);
              setEditing(null);
            }} style={{ marginTop: 22, background: COLORS.green, color: COLORS.dark, border: "none", borderRadius: 10, padding: "12px 18px", fontFamily: "inherit", fontWeight: 900, cursor: "pointer" }}>
              Back to Evaluations
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!canViewAll) {
    const language = growerProfile?.language || "en";
    const copy = SELF_COPY[language] || SELF_COPY.en;
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 90 }}>
        <PageHeader
          title={!selfOnly && myAssignments.length > 0 ? "Evaluations" : copy.title}
          subtitle={!selfOnly && myAssignments.length > 0 ? `${myAssignments.length} employee review${myAssignments.length !== 1 ? "s" : ""} assigned to you` : LANGUAGE_LABELS[language]}
          onBack={onBack}
        />
        <div style={{ padding: 14 }}>
          {!selfOnly && myAssignments.length > 0 && (
            <Section title="Employee Reviews Assigned to You" subtitle="Open an employee below to complete and submit their review.">
              {myAssignments.map(assignment => (
                <button key={assignment.id} onClick={() => startAssignedEvaluation(assignment)}
                  style={{ width: "100%", textAlign: "left", background: "#f8faf6", border: `1.5px solid ${COLORS.border}`, borderRadius: 11, padding: 13, marginBottom: 8, fontFamily: "inherit", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: COLORS.dark }}>{assignment.employeeName}</div>
                      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 3 }}>{assignment.employeeDepartment || assignment.employeeRole || "Staff"}</div>
                    </div>
                    <span style={{ background: "#e8efe4", color: COLORS.dark, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 900, alignSelf: "flex-start" }}>
                      {LANGUAGE_LABELS[assignment.employeeLanguage || "en"]}
                    </span>
                  </div>
                  <div style={{ color: "#467335", fontSize: 11, fontWeight: 900, marginTop: 9 }}>Open employee evaluation →</div>
                </button>
              ))}
            </Section>
          )}

          <button onClick={startSelfEvaluation}
            style={{ width: "100%", textAlign: "left", background: "#fff", border: `1.5px solid ${COLORS.border}`, borderTop: `5px solid ${COLORS.green}`, borderRadius: 14, padding: 18, fontFamily: "inherit", cursor: "pointer", marginBottom: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.dark }}>{copy.title}</div>
            <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.45, marginTop: 6 }}>{copy.subtitle}</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#467335", marginTop: 12 }}>{copy.submit} →</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: 90 }}>
      <PageHeader title="Employee Evaluations" subtitle="Annual reviews, feedback, goals, and follow-up" onBack={onBack} />
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", background: "#e1eadc", padding: 4, borderRadius: 12, marginBottom: 14 }}>
          {[
            ["reviews", "Reviews"],
            ["assignments", "Assignments & Staff"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setOwnerTab(id)}
              style={{ flex: 1, border: "none", borderRadius: 9, padding: "11px 8px", background: ownerTab === id ? COLORS.dark : "transparent", color: ownerTab === id ? COLORS.cream : COLORS.muted, fontFamily: "inherit", fontWeight: 900, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>

        {ownerTab === "assignments" && (
          <>
            <div style={{ background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <Field label="Assignment year">
                <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", fontWeight: 700 }}>
                  {[0, 1, 2, 3, 4].map(offset => {
                    const year = new Date().getFullYear() - offset;
                    return <option key={year} value={year}>{year}</option>;
                  })}
                </select>
              </Field>
              <div style={{ fontSize: 12, color: COLORS.muted }}>
                Assign every staff member to the manager responsible for completing their employee evaluation.
              </div>
            </div>

            <Section title="Staff Roster" subtitle={`${employees.length} active staff · managers are marked`}>
              {employees.map(person => {
                const assignment = (assignments || []).find(row =>
                  Number(row.reviewYear) === Number(yearFilter) && row.employeeName === person.workerName
                );
                const isManagerPerson = managers.some(manager => manager.workerName === person.workerName);
                return (
                  <div key={person.id || person.workerName} style={{ padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.dark }}>
                          {person.workerName} {isManagerPerson && <span style={{ color: "#8a5917", fontSize: 10 }}>MANAGER</span>}
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                          {[person.staffGroup || person.department, person.title].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <span style={{ background: "#edf4e9", color: COLORS.dark, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 900, alignSelf: "flex-start" }}>
                        {LANGUAGE_LABELS[person.language || "en"]}
                      </span>
                    </div>
                    <select value={assignment?.managerName || ""} onChange={e => assignEmployee(person, e.target.value)}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 9, border: `1.5px solid ${assignment ? COLORS.green : COLORS.border}`, background: "#fff", fontFamily: "inherit", fontSize: 13 }}>
                      <option value="">Not assigned</option>
                      {managers.map(manager => <option key={manager.workerName} value={manager.workerName}>{manager.workerName}</option>)}
                    </select>
                  </div>
                );
              })}
            </Section>
          </>
        )}

        {ownerTab === "reviews" && (
        <>
        <div style={{ background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
              style={{ flex: 1, border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", fontWeight: 700 }}>
              {[0, 1, 2, 3, 4].map(offset => {
                const year = new Date().getFullYear() - offset;
                return <option key={year} value={year}>{year} reviews</option>;
              })}
            </select>
            <button onClick={startNew}
              style={{ background: COLORS.green, color: COLORS.dark, border: "none", borderRadius: 10, padding: "10px 14px", fontFamily: "inherit", fontWeight: 900, cursor: "pointer" }}>
              + New
            </button>
          </div>
        </div>

        {loading && <div style={{ textAlign: "center", color: COLORS.muted, padding: 30 }}>Loading evaluations...</div>}
        {error && <div style={{ color: COLORS.red, background: "#fff0ed", padding: 12, borderRadius: 10 }}>{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ background: "#fff", border: `1.5px dashed ${COLORS.border}`, borderRadius: 14, padding: "34px 20px", textAlign: "center" }}>
            <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 20, color: COLORS.dark }}>No {yearFilter} evaluations yet</div>
            <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>Start a review and save it as a draft during the conversation.</div>
          </div>
        )}

        {filtered.map(row => {
          const managerScore = average(row.managerRatings);
          const employerScore = average(row.employerRatings);
          return (
            <button key={row.id} onClick={() => { setEditing({ ...EMPTY_FORM, ...row }); setTab("employee"); setSaveError(""); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: "#fff", border: `1.5px solid ${COLORS.border}`, borderLeft: `5px solid ${row.status === "completed" ? COLORS.green : COLORS.amber}`, borderRadius: 13, padding: 14, marginBottom: 10, fontFamily: "inherit", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, color: COLORS.dark, fontWeight: 900 }}>{row.employeeName}</div>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
                    {[row.department, row.employeeRole].filter(Boolean).join(" · ") || "Employee"}
                  </div>
                  {row.assignedManagerName && <div style={{ fontSize: 11, color: "#467335", fontWeight: 800, marginTop: 3 }}>Evaluator: {row.assignedManagerName}</div>}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={{ borderRadius: 999, padding: "4px 9px", background: row.managerStatus === "completed" ? "#e6f2df" : "#fff2df", color: row.managerStatus === "completed" ? "#39612d" : "#8a5917", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>
                    Manager: {row.managerStatus || "pending"}
                  </span>
                  <span style={{ borderRadius: 999, padding: "4px 9px", background: row.employeeStatus === "completed" ? "#e6f2df" : "#eef1ec", color: row.employeeStatus === "completed" ? "#39612d" : COLORS.muted, fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>
                    Self: {row.employeeStatus || "pending"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>
                <span style={{ background: COLORS.bg, borderRadius: 8, padding: "5px 8px" }}>Employee score: {managerScore || "Not rated"}</span>
                <span style={{ background: COLORS.bg, borderRadius: 8, padding: "5px 8px" }}>Employer score: {employerScore || "Not rated"}</span>
              </div>
              {row.followUpDate && <div style={{ fontSize: 11, color: COLORS.amber, fontWeight: 800, marginTop: 9 }}>Follow-up: {new Date(`${row.followUpDate}T00:00:00`).toLocaleDateString()}</div>}
            </button>
          );
        })}
        </>
        )}
      </div>
    </div>
  );
}
