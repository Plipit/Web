/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useSpring, useMotionValue } from "motion/react";
import { Logo } from "./components/Logo";
import { 
  Globe, 
  Zap,
  Calendar, 
  CheckCircle2, 
  ArrowRight, 
  Layout, 
  Sparkles, 
  Code2, 
  MessageSquare,
  Menu,
  X,
  ExternalLink,
  Cpu,
  Layers,
  MousePointer2,
  Terminal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const SAN_FRANCISCO_TIME_ZONE = "America/Los_Angeles";
const BOOKING_SLOT_TIMES = ["09:00", "11:30", "14:00", "16:30", "17:00", "18:30"];

function getTimeZoneDate(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return new Date(year, month - 1, day);
}

function getTimeZoneCurrentMinutes(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

function formatBookingDate(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...options,
  }).format(date);
}

function sanitizePhoneNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

function formatUSPhoneNumber(value: string) {
  const digits = sanitizePhoneNumber(value);

  if (digits.length <= 3) {
    return digits ? `(${digits}` : "";
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function isStaticPublicMode() {
  return (
    typeof window !== "undefined" &&
    window.location.protocol.startsWith("http") &&
    !window.location.hostname.includes("localhost") &&
    !window.location.hostname.includes("127.0.0.1")
  );
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDaysFromToday(date: Date, today: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date.getTime() - today.getTime()) / millisecondsPerDay);
}

function getSlotMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function getAvailableSlotsForDate(date: Date, today: Date, currentMinutes: number) {
  const dayOffset = getDaysFromToday(date, today);

  if (dayOffset < 0 || dayOffset > 45) {
    return [];
  }

  if (isSameCalendarDay(date, today)) {
    return BOOKING_SLOT_TIMES.filter((time) => getSlotMinutes(time) > currentMinutes + 30);
  }

  return BOOKING_SLOT_TIMES;
}

const demos = [
  {
    title: "San Jose Landscaping",
    category: "Service / Local",
    description: "Client-facing landscaping demo for the San Jose market.",
    size: "large",
    link: "https://san-jose-landscaping.pages.dev/"
  }
];

export default function App() {
  const [sfToday, setSfToday] = useState(() => getTimeZoneDate(SAN_FRANCISCO_TIME_ZONE));
  const [sfCurrentMinutes, setSfCurrentMinutes] = useState(() => getTimeZoneCurrentMinutes(SAN_FRANCISCO_TIME_ZONE));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(() => getTimeZoneDate(SAN_FRANCISCO_TIME_ZONE));
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => getTimeZoneDate(SAN_FRANCISCO_TIME_ZONE));
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"growth" | "enterprise" | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<{ success: boolean; message: string } | null>(null);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);
  const yParallax = useTransform(scrollYProgress, [0, 1], [0, -100]);

  // Mouse spotlight effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  useEffect(() => {
    const syncSanFranciscoDate = () => {
      setSfToday(getTimeZoneDate(SAN_FRANCISCO_TIME_ZONE));
      setSfCurrentMinutes(getTimeZoneCurrentMinutes(SAN_FRANCISCO_TIME_ZONE));
    };

    syncSanFranciscoDate();
    const intervalId = window.setInterval(syncSanFranciscoDate, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setSelectedTime(null);
  }, [date]);

  useEffect(() => {
    if (!date) {
      setDate(sfToday);
      setCalendarMonth(sfToday);
      return;
    }

    if (getAvailableSlotsForDate(date, sfToday, sfCurrentMinutes).length === 0) {
      setDate(sfToday);
      setCalendarMonth(sfToday);
    }
  }, [date, sfToday, sfCurrentMinutes]);

  const handleBooking = async () => {
    if (!date || !selectedTime) return;
    const trimmedName = contactName.trim();
    const trimmedEmail = contactEmail.trim();
    const trimmedPhone = sanitizePhoneNumber(contactPhone);

    if (!trimmedName || trimmedPhone.length !== 10) {
      setBookingStatus({
        success: false,
        message: "Add your name and a valid 10-digit US phone number before booking.",
      });
      return;
    }

    setIsBooking(true);
    setBookingStatus(null);

    if (isStaticPublicMode()) {
      try {
        window.localStorage.setItem(
          "plipitBookingDraft",
          JSON.stringify({
            date: formatBookingDate(date, SAN_FRANCISCO_TIME_ZONE, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }),
            time: selectedTime,
            name: trimmedName,
            email: trimmedEmail,
            phone: `+1${trimmedPhone}`,
            createdAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore localStorage issues and still show a graceful static-mode confirmation.
      }

      setBookingStatus({
        success: true,
        message: "Request saved for now. Live booking confirmation will be wired up with the backend next.",
      });
      setIsBooking(false);
      return;
    }

    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formatBookingDate(date, SAN_FRANCISCO_TIME_ZONE, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          time: selectedTime,
          name: trimmedName,
          email: trimmedEmail,
          phone: `+1${trimmedPhone}`,
        })
      });

      const data = await response.json();
      if (data.success) {
        setBookingStatus({ success: true, message: data.message });
      } else {
        setBookingStatus({ success: false, message: "Something went wrong. Please try again." });
      }
    } catch (error) {
      console.error("Booking error:", error);
      setBookingStatus({ success: false, message: "Failed to connect to server." });
    } finally {
      setIsBooking(false);
    }
  };

  const selectedDateLabel = date
    ? formatBookingDate(date, SAN_FRANCISCO_TIME_ZONE, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const currentDateLabel = formatBookingDate(sfToday, SAN_FRANCISCO_TIME_ZONE, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const hasPhoneNumber = sanitizePhoneNumber(contactPhone).length === 10;
  const availableSlots = date ? getAvailableSlotsForDate(date, sfToday, sfCurrentMinutes) : [];

  return (
    <div className="min-h-screen bg-[#080808] text-[#e0e0e0] font-sans selection:bg-orange-500/30 selection:text-white antialiased">
      {/* Scroll Progress Bar */}
      <motion.div 
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 z-[60] origin-left"
        style={{ scaleX }}
      />

      {/* Impeccable Grid Background */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ duration: 2 }}
        className="fixed inset-0 grid-lines pointer-events-none" 
      />
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#080808]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <Logo />
          </motion.div>

          <div className="hidden md:flex items-center gap-10">
            {["Demos", "Pricing", "Booking", "Process"].map((item, i) => (
              <motion.a 
                key={item}
                href={`#${item.toLowerCase()}`} 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}
                className="text-[11px] uppercase tracking-[0.2em] font-bold text-white/50 hover:text-indigo-400 transition-colors"
              >
                {item}
              </motion.a>
            ))}
            <motion.a 
              href="#booking"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button className="bg-white !text-black hover:bg-indigo-500 hover:text-white rounded-full px-6 h-9 text-xs font-bold uppercase tracking-widest transition-all duration-300">
                  Start Project
                </Button>
              </motion.div>
            </motion.a>
          </div>

          <motion.button 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden text-white" 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </motion.button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-40 bg-[#080808] pt-24 px-6 md:hidden"
          >
            <div className="flex flex-col gap-8">
              {["Demos", "Pricing", "Booking", "Process"].map((item, i) => (
                <motion.a 
                  key={item}
                  href={`#${item.toLowerCase()}`} 
                  onClick={() => setIsMenuOpen(false)} 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 * i }}
                  className="text-4xl font-bold font-display text-white border-b border-white/5 pb-4"
                >
                  {item}
                </motion.a>
              ))}
              <motion.a 
                href="#booking" 
                onClick={() => setIsMenuOpen(false)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button className="w-full bg-indigo-600 text-white rounded-2xl py-8 text-xl font-bold mt-4">
                    Get Started
                  </Button>
                </motion.div>
              </motion.a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        {/* Hero Section - Impeccable Style */}
        <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden pt-20">
          <motion.div 
            style={{ opacity, scale }}
            className="max-w-5xl mx-auto text-center relative z-10"
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-400 mb-8"
              >
                <Zap size={12} />
                High-Agency Digital Craft
              </motion.div>
              <motion.h1 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="text-6xl md:text-[120px] font-bold tracking-tighter mb-10 leading-[0.85] font-display text-white"
              >
                Impeccable <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">Interfaces.</span>
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-12 leading-relaxed font-medium"
              >
                We don't just build websites. We craft high-performance digital instruments that elevate your brand and drive radical growth.
              </motion.p>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col sm:flex-row items-center justify-center gap-6"
              >
                <a href="#demos">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      size="lg" 
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-10 h-14 text-sm font-bold uppercase tracking-widest group shadow-[0_0_30px_rgba(79,70,229,0.3)] transition-all duration-300"
                    >
                      View Portfolio
                      <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
                    </Button>
                  </motion.div>
                </a>
                <a href="#process">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      size="lg" 
                      variant="outline" 
                      className="rounded-full px-10 h-14 text-sm font-bold uppercase tracking-widest border-white/20 hover:bg-white/5 text-white bg-white/5 transition-all duration-300"
                    >
                      The Process
                    </Button>
                  </motion.div>
                </a>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Atmospheric Background */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 2, ease: "easeOut" }}
              style={{ y: yParallax }}
              className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
              style={{ y: useTransform(scrollYProgress, [0, 1], [0, 100]) }}
              className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-pink-500/10 rounded-full blur-[120px] animate-pulse" 
            />
          </div>
        </section>

        {/* Bento Grid Demos */}
        <section id="demos" className="px-6 py-32 border-t border-white/5 bg-[#0a0a0a]">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
              >
                <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-indigo-400 mb-4">Selected Works</div>
                <h2 className="text-4xl md:text-6xl font-bold tracking-tight font-display text-white">The Demos.</h2>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="flex gap-4"
              >
                <div className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Scroll to explore</div>
                <div className="w-12 h-[1px] bg-white/10 self-center" />
              </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[300px]">
              {demos.map((demo, index) => (
                <motion.article
                  key={demo.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ 
                    duration: 0.8, 
                    delay: index * 0.1,
                    ease: [0.16, 1, 0.3, 1]
                  }}
                  whileHover={{ scale: 0.98 }}
                  className={`group relative overflow-hidden rounded-3xl hardware-border bg-white/5 ${
                    demo.size === 'large' ? 'md:col-span-8 md:row-span-2' : 
                    demo.size === 'medium' ? 'md:col-span-4 md:row-span-2' : 
                    'md:col-span-4 md:row-span-1'
                  }`}
                >
                  {/* Spotlight effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 pointer-events-none"
                    style={{
                      background: `radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(255,255,255,0.06), transparent 40%)`
                    } as any}
                  />
                  <div className="absolute inset-x-5 top-5 bottom-36 overflow-hidden rounded-[1.75rem] border border-white/8 bg-[#0d0d0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex h-10 items-center justify-between border-b border-white/8 bg-black/30 px-4">
                      <div className="flex gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-white/20" />
                        <div className="h-2 w-2 rounded-full bg-white/12" />
                        <div className="h-2 w-2 rounded-full bg-white/12" />
                      </div>
                      <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                        Live preview
                      </div>
                    </div>
                    <div className="h-[calc(100%-2.5rem)] overflow-auto">
                      <iframe
                        src={demo.link}
                        title={`${demo.title} live preview`}
                        loading="lazy"
                        className="h-[980px] w-full border-0 transition-all duration-700 group-hover:translate-y-[-6px]"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/8 bg-gradient-to-b from-black/0 to-black/95 px-8 pb-8 pt-6">
                    <div className="flex items-start justify-between gap-6">
                      <div className="min-w-0">
                        <Badge className="bg-indigo-600 text-white border-none mb-3 text-[10px] uppercase tracking-widest font-bold">
                          {demo.category}
                        </Badge>
                        <h3 className="text-2xl font-bold text-white mb-2">{demo.title}</h3>
                        <p className="text-white/40 text-sm font-medium max-w-2xl">
                          {demo.description}
                        </p>
                      </div>
                      <a
                        href={demo.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition-colors duration-300 hover:bg-white/16"
                        aria-label={`Open ${demo.title} in a new tab`}
                      >
                        <ExternalLink size={16} className="text-white" />
                      </a>
                    </div>
                  </div>
                  <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-6 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                    <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white/70 backdrop-blur-md">
                      Scroll inside preview
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* Process Section - Hardware Aesthetic */}
        <section id="process" className="px-6 py-32 bg-[#080808] relative overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
              >
                <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-indigo-400 mb-6">Our Methodology</div>
                <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8 font-display text-white leading-tight">
                  Built with <br /> Impeccable <br /> Precision.
                </h2>
                <div className="space-y-10">
                  {[
                    { icon: <Terminal size={20} />, title: "Technical Excellence", desc: "Clean code architecture designed for scale and performance." },
                    { icon: <Layers size={20} />, title: "Layered Design", desc: "Depth and atmosphere created through intentional visual hierarchy." },
                    { icon: <MousePointer2 size={20} />, title: "Radical UX", desc: "Frictionless interactions that feel like a natural extension of the user." },
                    { icon: <Globe size={20} />, title: "Mobile Optimization", desc: "Flawless performance across all devices and screen sizes." }
                  ].map((item, i) => (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1, duration: 0.5 }}
                      className="flex gap-6"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-indigo-400 shadow-[0_0_20px_rgba(255,255,255,0.02)]">
                        {item.icon}
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-white mb-2 uppercase tracking-wider">{item.title}</h4>
                        <p className="text-white/40 leading-relaxed font-medium">{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
                whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <div className="aspect-square glass-card rounded-[3rem] p-12 flex flex-col justify-center items-center text-center hardware-border">
                  <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 mb-8 animate-pulse shadow-[0_0_50px_rgba(79,70,229,0.2)]">
                    <Globe size={64} />
                  </div>
                  <h3 className="text-3xl font-bold text-white mb-4 font-display">Global Standards</h3>
                  <p className="text-white/40 max-w-sm font-medium">
                    We adhere to the highest industry standards, ensuring your digital presence is robust, secure, and future-proof.
                  </p>
                  <div className="mt-10 flex gap-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500/40" />
                    ))}
                  </div>
                </div>
                {/* Decorative Elements */}
                <div className="absolute -top-10 -right-10 w-40 h-40 border border-white/5 rounded-full opacity-20" />
                <div className="absolute -bottom-20 -left-20 w-60 h-60 border border-white/5 rounded-full opacity-10" />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Pricing - Impeccable Cards */}
        <section id="pricing" className="px-6 py-32 bg-[#0a0a0a] border-t border-white/5">
          <div className="max-w-7xl mx-auto">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="text-center mb-24"
            >
              <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-indigo-400 mb-4">Investment</div>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tight font-display text-white">Radical Value.</h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl mx-auto">
              {/* Plan 1 */}
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="group relative glass-card rounded-[2.5rem] p-10 hardware-border hover:border-indigo-500/50 transition-all duration-500"
              >
                <div className="flex justify-between items-start mb-10">
                  <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500">
                    <Zap size={28} />
                  </div>
                  <Badge className="bg-indigo-600 text-white border-none px-4 py-1 text-[10px] font-bold uppercase tracking-widest">Growth</Badge>
                </div>
                <h3 className="text-3xl font-bold text-white mb-4 font-display">Subscription</h3>
                <div className="flex items-baseline gap-2 mb-8">
                  <span className="text-6xl font-bold text-white">$99</span>
                  <span className="text-white/30 font-bold uppercase text-xs tracking-widest">/ Month</span>
                </div>
                <ul className="space-y-5 mb-12">
                  {["Unlimited Updates", "Premium Hosting", "SEO Optimization", "24/7 Support", "Mobile Optimized"].map((f) => (
                    <li key={f} className="flex items-center gap-4 text-white/50 font-medium">
                      <CheckCircle2 size={18} className="text-indigo-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="#booking">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      aria-pressed={selectedPlan === "growth"}
                      onClick={() => setSelectedPlan("growth")}
                      className={`w-full rounded-2xl py-8 text-sm font-bold uppercase tracking-widest transition-all duration-300 border ${
                        selectedPlan === "growth"
                          ? "bg-indigo-600 !text-white border-indigo-400 shadow-[0_0_35px_rgba(99,102,241,0.35)]"
                          : "bg-white !text-black border-white hover:bg-indigo-600 hover:!text-white hover:border-indigo-400 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]"
                      }`}
                    >
                      Select Growth
                    </Button>
                  </motion.div>
                </a>
              </motion.div>

              {/* Plan 2 */}
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="group relative glass-card rounded-[2.5rem] p-10 hardware-border hover:border-pink-500/50 transition-all duration-500"
              >
                <div className="flex justify-between items-start mb-10">
                  <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center text-pink-500">
                    <Globe size={28} />
                  </div>
                  <Badge className="bg-pink-500 text-white border-none px-4 py-1 text-[10px] font-bold uppercase tracking-widest">Enterprise</Badge>
                </div>
                <h3 className="text-3xl font-bold text-white mb-4 font-display">Ownership</h3>
                <div className="flex flex-col mb-8">
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-bold text-white">$750</span>
                    <span className="text-white/30 font-bold uppercase text-xs tracking-widest">One-time</span>
                  </div>
                  <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-3">+ $25/mo maintenance</div>
                </div>
                <ul className="space-y-5 mb-12">
                  {["Source Ownership", "Custom Architecture", "Security Monitoring", "Quarterly Reviews", "Mobile Optimized"].map((f) => (
                    <li key={f} className="flex items-center gap-4 text-white/50 font-medium">
                      <CheckCircle2 size={18} className="text-pink-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="#booking">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="outline"
                      aria-pressed={selectedPlan === "enterprise"}
                      onClick={() => setSelectedPlan("enterprise")}
                      className={`w-full rounded-2xl py-8 text-sm font-bold uppercase tracking-widest transition-all duration-300 border ${
                        selectedPlan === "enterprise"
                          ? "bg-pink-500 !text-white border-pink-400 shadow-[0_0_35px_rgba(236,72,153,0.35)]"
                          : "bg-white !text-black border-white hover:bg-pink-500 hover:!text-white hover:border-pink-400 hover:shadow-[0_0_30px_rgba(236,72,153,0.2)]"
                      }`}
                    >
                      Select Enterprise
                    </Button>
                  </motion.div>
                </a>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Booking - Impeccable Interface */}
        <section id="booking" className="px-6 py-32 bg-[#080808]">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
              >
                <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-indigo-400 mb-6">Consultation</div>
                <h2 className="text-4xl md:text-7xl font-bold tracking-tighter mb-8 font-display text-white leading-[0.9]">
                  Let's craft <br /> your future.
                </h2>
                <p className="text-white/40 text-lg mb-12 leading-relaxed font-medium max-w-md">
                  Book a high-agency strategy session to discuss your vision and how we can bring it to life with impeccable precision.
                </p>
                
                <div className="grid grid-cols-2 gap-6">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="p-6 glass-card rounded-3xl hardware-border"
                  >
                    <div className="text-indigo-400 mb-4"><MessageSquare size={24} /></div>
                    <h4 className="font-bold text-white mb-2 uppercase text-xs tracking-widest">Strategy</h4>
                    <p className="text-white/30 text-xs font-medium">Deep dive into your goals.</p>
                  </motion.div>
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="p-6 glass-card rounded-3xl hardware-border"
                  >
                    <div className="text-pink-400 mb-4"><Layout size={24} /></div>
                    <h4 className="font-bold text-white mb-2 uppercase text-xs tracking-widest">Design</h4>
                    <p className="text-white/30 text-xs font-medium">Visualizing the interface.</p>
                  </motion.div>
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="glass-card rounded-[3rem] p-8 hardware-border relative"
              >
                <div className="absolute top-0 right-0 p-8">
                  <div className="flex gap-1">
                    {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-white/20" />)}
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="mb-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/35">
                      Live date synced to San Francisco
                    </p>
                    <p className="mt-2 text-xs font-medium text-white/55">
                      Today in PT: {currentDateLabel}
                    </p>
                  </div>
                  <CalendarComponent
                    mode="single"
                    selected={date}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    onSelect={(nextDate) => {
                      if (!nextDate) return;
                      setDate(nextDate);
                    }}
                    today={sfToday}
                    disabled={(day) => getAvailableSlotsForDate(day, sfToday, sfCurrentMinutes).length === 0}
                    modifiers={{
                      available: (day) => getAvailableSlotsForDate(day, sfToday, sfCurrentMinutes).length > 0,
                    }}
                    className="rounded-2xl border-none bg-white/5 p-4 text-white mb-8"
                  />
                  <div className="w-full space-y-6">
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-center uppercase tracking-[0.28em] text-white/35">
                        Contact details for the booking
                      </p>
                      <div className="grid grid-cols-1 gap-3">
                        <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                          Your name <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={contactName}
                          onChange={(event) => setContactName(event.target.value)}
                          placeholder="Your name"
                          className="h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white placeholder:text-white/30 transition-colors outline-none focus:border-indigo-400 focus:bg-white/8"
                        />
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45 md:col-span-1">
                            Email address
                          </label>
                          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45 md:col-span-1">
                            Phone number <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="email"
                            value={contactEmail}
                            onChange={(event) => setContactEmail(event.target.value)}
                            placeholder="Email address"
                            className="h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white placeholder:text-white/30 transition-colors outline-none focus:border-indigo-400 focus:bg-white/8"
                          />
                          <div className="flex h-12 overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors focus-within:border-pink-400 focus-within:bg-white/8">
                            <div className="flex items-center border-r border-white/10 px-3 text-sm font-bold text-white/55">
                              +1
                            </div>
                            <input
                              type="tel"
                              value={formatUSPhoneNumber(contactPhone)}
                              onChange={(event) => setContactPhone(sanitizePhoneNumber(event.target.value))}
                              placeholder="(408) 555-1234"
                              inputMode="numeric"
                              autoComplete="tel-national"
                              className="h-full w-full bg-transparent px-4 text-sm font-medium text-white placeholder:text-white/30 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-center text-[10px] font-medium uppercase tracking-[0.22em] text-white/30">
                        Add a name and a 10-digit US phone number to continue
                      </p>
                    </div>
                    <h4 className="font-bold text-center text-white/60 uppercase tracking-widest text-[10px]">
                      Available Slots <span className="text-rose-400">*</span> • {selectedDateLabel} • San Francisco PT
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      {availableSlots.map((time) => (
                        <Button 
                          key={time} 
                          variant="outline" 
                          onClick={() => setSelectedTime(time)}
                          className={`rounded-xl border-white/5 bg-white/5 text-xs font-bold transition-all duration-300 ${
                            selectedTime === time 
                              ? "border-indigo-400 text-indigo-400 bg-indigo-400/10" 
                              : "text-white/60 hover:border-indigo-400 hover:text-indigo-400 hover:bg-indigo-400/10"
                          }`}
                        >
                          {time}
                        </Button>
                      ))}
                    </div>
                    {availableSlots.length === 0 && (
                      <p className="text-center text-[10px] font-medium uppercase tracking-[0.22em] text-white/30">
                        No slots left for this day. Pick another available date.
                      </p>
                    )}
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button 
                        onClick={handleBooking}
                        disabled={isBooking || !selectedTime || !contactName.trim() || !hasPhoneNumber || availableSlots.length === 0}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-8 text-sm font-bold uppercase tracking-widest shadow-[0_0_30px_rgba(79,70,229,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isBooking ? "Processing..." : "Confirm Call"}
                      </Button>
                    </motion.div>
                    {bookingStatus && (
                      <motion.p 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`text-center text-xs font-bold uppercase tracking-widest mt-4 ${
                          bookingStatus.success ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {bookingStatus.message}
                      </motion.p>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer - Impeccable Style */}
      <footer className="bg-[#080808] border-t border-white/5 py-32 px-6 relative overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-7xl mx-auto relative z-10"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-20 mb-24">
            <div className="col-span-1 md:col-span-2">
              <Logo className="mb-8" />
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-white/30 max-w-sm mb-10 font-medium leading-relaxed"
              >
                The future of the web is impeccable. We build high-agency digital experiences for the next generation of brands.
              </motion.p>
              <div className="flex gap-6">
                {[Globe, Code2, Terminal].map((Icon, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 * i }}
                    className="w-12 h-12 glass-card rounded-2xl flex items-center justify-center text-white/40 hover:text-indigo-400 hover:border-indigo-400/50 cursor-pointer transition-all duration-300"
                  >
                    <Icon size={20} />
                  </motion.div>
                ))}
              </div>
            </div>
            <div>
              <motion.h4 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="font-bold mb-8 uppercase text-[10px] tracking-[0.3em] text-white/20"
              >
                Navigation
              </motion.h4>
              <ul className="space-y-5">
                {["Demos", "Pricing", "Booking", "Process"].map((item, i) => (
                  <motion.li 
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 * i }}
                  >
                    <a href="#" className="text-white/40 hover:text-indigo-400 transition-colors font-medium text-sm">{item}</a>
                  </motion.li>
                ))}
              </ul>
            </div>
            <div>
              <motion.h4 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="font-bold mb-8 uppercase text-[10px] tracking-[0.3em] text-white/20"
              >
                Legal
              </motion.h4>
              <ul className="space-y-5">
                {["Privacy", "Terms", "Cookies"].map((item, i) => (
                  <motion.li 
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 * i }}
                  >
                    <a href="#" className="text-gray-400 hover:text-indigo-400 transition-colors font-medium text-sm">{item}</a>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.5 }}
            className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8"
          >
            <p className="text-white/20 text-xs font-bold uppercase tracking-widest">© 2026 Plipit Studio. All rights reserved.</p>
            <div className="flex items-center gap-2 text-white/20 text-xs font-bold uppercase tracking-widest">
              Crafted with <Zap size={14} className="text-indigo-400" /> for the impeccable.
            </div>
          </motion.div>
        </motion.div>
        {/* Footer Glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-indigo-500/5 blur-[120px] -z-10" />
      </footer>
    </div>
  );
}
