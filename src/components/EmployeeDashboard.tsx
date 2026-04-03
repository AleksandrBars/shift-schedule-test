import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { logActivity } from './lib/activityLog';
import { UserProfile, Shift, Priority } from './types';
import { Loader2, Calendar, Trash2, Star, Map as MapIcon, ChevronLeft, ChevronRight, AlertCircle, Clock, X, Info, LayoutGrid, List, MessageSquare } from 'lucide-react';
import { format, isBefore, startOfDay, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { getRandomGreeting } from './utils/greetings';

// --- Constants ---
const AVAILABLE_MONTHS = [
  { value: 3, label: 'Апрель', year: 2025 },
  { value: 4, label: 'Май', year: 2025 },
  { value: 5, label: 'Июнь', year: 2025 },
  { value: 6, label: 'Июль', year: 2025 },
  { value: 7, label: 'Август', year: 2025 },
  { value: 8, label: 'Сентябрь', year: 2025 },
];

function getYearForMonth(monthIndex: number): number {
  const m = AVAILABLE_MONTHS.find(m => m.value === monthIndex);
  return m?.year ?? new Date().getFullYear();
}

function canDeleteShift(shift: Shift): { allowed: boolean; reason?: string } {
  const now = new Date();
  const today = startOfDay(now);
  const shiftDate = parseISO(shift.work_date);
  const shiftDay = startOfDay(shiftDate);

  if (isBefore(shiftDay, today) || shiftDay.getTime() === today.getTime()) {
    return { allowed: false, reason: 'Нельзя удалить прошедшую смену' };
  }

  const startTimeStr = shift.is_full_day ? '00:00:00' : (shift.start_time || '00:00:00');
  const shiftStart = new Date(`${shift.work_date}T${startTimeStr}`);
  const diffHours = (shiftStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours < 22) {
    return { allowed: false, reason: 'До начала смены менее 22 часов — удаление невозможно' };
  }
  return { allowed: true };
}

function generateTimeOptions(minH: number, maxH: number) {
  const opts = [];
  for (let h = minH; h <= maxH; h++) {
    for (const m of ['00', '15', '30', '45']) {
      if (h === maxH && m !== '00') continue;
      opts.push(`${h.toString().padStart(2, '0')}:${m}`);
    }
  }
  return opts;
}

const START_TIME_OPTIONS = generateTimeOptions(10, 20);
const END_TIME_OPTIONS = generateTimeOptions(12, 23);

export function EmployeeDashboard({ profile }: { profile: UserProfile }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [greeting, setGreeting] = useState('');
  
  // Mobile Tab state
  const [activeTab, setActiveTab] = useState<'info' | 'shifts' | 'form'>('shifts');

  // Month
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(() => {
    const currentMonth = new Date().getMonth();
    const found = AVAILABLE_MONTHS.find(m => m.value === currentMonth);
    return found ? found.value : AVAILABLE_MONTHS[0].value;
  });

  // Modal State for Add Shift
  const [selectedDateToAdd, setSelectedDateToAdd] = useState<Date | null>(null);
  const [shiftType, setShiftType] = useState<'full' | 'partial'>('full');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [savingShift, setSavingShift] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Ping for footer
  const [ping, setPing] = useState(312);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setPing(prev => {
        const change = Math.floor(Math.random() * 21) - 10;
        let next = prev + change;
        if (next < 78) next = 78;
        if (next > 458) next = 458;
        return next;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (profile.full_name) {
      setGreeting(getRandomGreeting(profile.full_name, new Date()));
    }
  }, [profile.full_name]);

  useEffect(() => {
    fetchData();
  }, [profile.id]);

  useEffect(() => {
    closeModal();
  }, [selectedMonthIndex]);

  const fetchData = async () => {
    setLoading(true);
    const { data: shiftData, error: shiftError } = await supabase
      .from('employee_availability')
      .select('id, employee_id, work_date, is_full_day, start_time, end_time')
      .eq('employee_id', profile.id)
      .order('work_date', { ascending: true });

    if (shiftData) setShifts(shiftData as Shift[]);
    if (shiftError) console.error(shiftError);

    const { data: prioData, error: prioError } = await supabase
      .from('employee_attraction_priorities')
      .select('id, priority_level, attractions(name)')
      .eq('employee_id', profile.id)
      .order('priority_level', { ascending: true });

    if (prioData) setPriorities(prioData as unknown as Priority[]);
    if (prioError) console.error(prioError);

    setLoading(false);
  };

  const shiftsForMonth = useMemo(() => {
    return shifts.filter(s => {
      const d = parseISO(s.work_date);
      return d.getMonth() === selectedMonthIndex && d.getFullYear() === getYearForMonth(selectedMonthIndex);
    });
  }, [shifts, selectedMonthIndex]);

  const daysInMonth = useMemo(() => {
    const year = getYearForMonth(selectedMonthIndex);
    const start = startOfMonth(new Date(year, selectedMonthIndex));
    const end = endOfMonth(start);
    return eachDayOfInterval({ start, end });
  }, [selectedMonthIndex]);

  const occupiedDates = useMemo(() => new Set(shifts.map(s => s.work_date)), [shifts]);

  const isDateSelectable = (date: Date) => {
    const dateStart = startOfDay(date);
    const todayStart = startOfDay(now);
    
    if (isBefore(dateStart, todayStart)) return false; 
    
    if (dateStart.getTime() === todayStart.getTime()) {
      if (now.getHours() >= 9) return false;
    }
    return true;
  };

  const handleDateClick = (date: Date) => {
    if (!isDateSelectable(date)) return;
    
    const dateStr = format(date, 'yyyy-MM-dd');
    if (occupiedDates.has(dateStr)) {
      alert('Смена на эту дату уже установлена');
      return;
    }
    
    setSelectedDateToAdd(date);
    setShiftType('full');
    setStartTime('10:00');
    setEndTime('12:00');
    setFormError(null);
  };

  const closeModal = () => {
    setSelectedDateToAdd(null);
    setFormError(null);
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDateToAdd) return;
    
    setFormError(null);
    const workDate = format(selectedDateToAdd, 'yyyy-MM-dd');

    if (occupiedDates.has(workDate)) {
      setFormError('На эту дату уже установлена смена.');
      return;
    }

    if (shiftType === 'partial' && startTime >= endTime) {
      setFormError('Время начала должно быть раньше времени конца');
      return;
    }

    setSavingShift(true);

    const isFullDay = shiftType === 'full';
    const newShift = {
      employee_id: profile.id,
      work_date: workDate,
      is_full_day: isFullDay,
      start_time: isFullDay ? null : startTime,
      end_time: isFullDay ? null : endTime,
    };

    const { error } = await supabase.from('employee_availability').insert([newShift]);

    if (!error) {
      await logActivity(
        'employee',
        profile.id,
        'shift_add',
        `Сотрудник ${profile.full_name} добавил смену на ${workDate}${!isFullDay ? ` (${startTime}–${endTime})` : ' (полный день)'}`
      );
      closeModal();
      await fetchData();
    } else {
      console.error(error);
      setFormError('Ошибка при добавлении смены. Попробуйте ещё раз.');
    }
    setSavingShift(false);
  };

  const handleDeleteShift = async (shift: Shift) => {
    const { allowed, reason } = canDeleteShift(shift);
    if (!allowed) {
      alert(reason);
      return;
    }
    if (!window.confirm('Удалить смену?')) return;

    const { error } = await supabase.from('employee_availability').delete().eq('id', shift.id);
    if (!error) {
      await logActivity(
        'employee',
        profile.id,
        'shift_delete',
        `Сотрудник ${profile.full_name} удалил смену на ${shift.work_date}`
      );
      await fetchData();
    } else {
      alert('Ошибка при удалении смены');
    }
  };

  const currentMonthLabel = AVAILABLE_MONTHS.find(m => m.value === selectedMonthIndex)?.label || '';
  const currentMonthIdx = AVAILABLE_MONTHS.findIndex(m => m.value === selectedMonthIndex);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin text-blue-600 h-10 w-10" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-24 md:pb-6 font-sans">
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Шапка */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{greeting || profile.full_name}</h2>
            <p className="text-gray-500 text-sm mt-1">{profile.full_name} • Возраст: {profile.age ?? 'Не указан'}</p>
          </div>
          <div className="mt-4 md:mt-0 md:text-right">
            <div className="text-2xl font-mono text-blue-600 font-semibold tracking-tight">
              {now.toLocaleTimeString('ru-RU')}
            </div>
            <div className="text-gray-500 text-sm mt-1 capitalize">
              {now.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Выбор месяца */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => currentMonthIdx > 0 && setSelectedMonthIndex(AVAILABLE_MONTHS[currentMonthIdx - 1].value)}
              disabled={currentMonthIdx === 0}
              className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h3 className="text-base font-semibold text-gray-800">Выбор месяца</h3>
            <button
              onClick={() => currentMonthIdx < AVAILABLE_MONTHS.length - 1 && setSelectedMonthIndex(AVAILABLE_MONTHS[currentMonthIdx + 1].value)}
              disabled={currentMonthIdx === AVAILABLE_MONTHS.length - 1}
              className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {AVAILABLE_MONTHS.map((m) => (
              <button
                key={m.value}
                onClick={() => setSelectedMonthIndex(m.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedMonthIndex === m.value
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200/50'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Основной контент (Grid для ПК, Tabs для Мобильных) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Левая колонка (на мобилках - вкладка Смены) */}
          <div className={`lg:col-span-2 space-y-6 ${activeTab !== 'shifts' ? 'hidden md:block' : 'block'}`}>
            
            {/* Блок дат (Новый) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <LayoutGrid className="mr-2 h-5 w-5 text-blue-500" />
                Даты месяца — {currentMonthLabel}
              </h3>
              
              <div className="grid grid-cols-7 gap-2 sm:gap-3">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                  <div key={day} className="text-center text-xs font-semibold text-gray-400 py-1">{day}</div>
                ))}
                
                {daysInMonth.map((day, i) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const shiftOnDay = shiftsForMonth.find(s => s.work_date === dateStr);
                  const selectable = isDateSelectable(day);
                  
                  // Сдвиг первого дня месяца
                  const firstDayOffset = i === 0 ? (day.getDay() === 0 ? 6 : day.getDay() - 1) : 0;
                  
                  let btnColor = "bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-transparent";
                  if (shiftOnDay) {
                    btnColor = shiftOnDay.is_full_day 
                      ? "bg-green-100 text-green-800 font-bold border border-green-200" 
                      : "bg-yellow-100 text-yellow-800 font-bold border border-yellow-200";
                  } else if (!selectable) {
                    btnColor = "bg-gray-100 text-gray-400 opacity-60 cursor-not-allowed border border-transparent";
                  }

                  return (
                    <React.Fragment key={dateStr}>
                      {i === 0 && Array.from({ length: firstDayOffset }).map((_, idx) => <div key={`empty-${idx}`} />)}
                      <button
                        onClick={() => handleDateClick(day)}
                        disabled={!selectable && !shiftOnDay}
                        className={`aspect-square flex flex-col items-center justify-center rounded-xl transition-all ${btnColor}`}
                      >
                        <span className="text-sm sm:text-base">{format(day, 'd')}</span>
                        {shiftOnDay && (
                          <span className="text-[10px] sm:text-xs leading-tight mt-0.5 opacity-80">
                            {shiftOnDay.is_full_day ? 'Полная' : 'Неполная'}
                          </span>
                        )}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap gap-4 text-xs sm:text-sm text-gray-600">
                <div className="flex items-center"><div className="w-3 h-3 rounded bg-green-100 border border-green-200 mr-2"></div>Полная смена</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200 mr-2"></div>Неполная смена</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded bg-gray-50 border border-gray-200 mr-2"></div>Свободно</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded bg-gray-100 opacity-60 mr-2"></div>Недоступно</div>
              </div>
            </div>

            {/* Таблица смен */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <List className="mr-2 h-5 w-5 text-blue-500" />
                Мои смены
              </h3>
              
              {shiftsForMonth.length === 0 ? (
                <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Calendar className="mx-auto h-10 w-10 mb-2 opacity-50 text-gray-400" />
                  <p>Смен в {currentMonthLabel.toLowerCase()} не найдено</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider rounded-tl-lg rounded-bl-lg">Дата</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Тип</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Время</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider rounded-tr-lg rounded-br-lg">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {shiftsForMonth.map(shift => {
                        const { allowed } = canDeleteShift(shift);
                        return (
                          <tr key={shift.id} className="hover:bg-gray-50/80 transition">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                              {format(parseISO(shift.work_date), 'dd.MM.yyyy')}
                            </td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap">
                              {shift.is_full_day ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200/50">
                                  Полный день
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200/50">
                                  Неполный день
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                              {shift.is_full_day
                                ? 'Весь день'
                                : `${shift.start_time?.slice(0, 5)} – ${shift.end_time?.slice(0, 5)}`}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {allowed ? (
                                <button
                                  onClick={() => handleDeleteShift(shift)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-xl transition"
                                  title="Удалить смену"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400 italic">Недоступно</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Правая колонка (на мобилках - вкладки Инфо и Форма) */}
          <div className="space-y-6">
            
            {/* Блок Инфо */}
            <div className={`space-y-6 ${activeTab !== 'info' ? 'hidden md:block' : 'block'}`}>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                  <Star className="mr-2 h-5 w-5 text-yellow-500" />
                  Приоритеты аттракционов
                </h3>
                {priorities.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <MapIcon className="mx-auto h-8 w-8 mb-2 opacity-50 text-gray-400" />
                    <p className="text-sm">Приоритеты не заданы</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {priorities.map(prio => (
                      <li key={prio.id} className="py-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 flex items-center">
                          <MapIcon className="mr-2 h-4 w-4 text-gray-400" />
                          {prio.attractions?.name || 'Неизвестный'}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
                          prio.priority_level === 1 ? 'bg-green-50 text-green-700 border-green-200/50' :
                          prio.priority_level === 2 ? 'bg-yellow-50 text-yellow-700 border-yellow-200/50' :
                          'bg-red-50 text-red-700 border-red-200/50'
                        }`}>
                          #{prio.priority_level}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100/50">
                <h3 className="text-sm font-semibold text-blue-900 mb-4 flex items-center">
                  <Info className="mr-2 h-4 w-4 text-blue-600" /> Сводка
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm bg-white/50 px-3 py-2 rounded-lg">
                    <span className="text-blue-800">Всего смен:</span>
                    <span className="font-bold text-blue-900">{shiftsForMonth.length}</span>
                  </div>
                  <div className="flex justify-between text-sm bg-white/50 px-3 py-2 rounded-lg">
                    <span className="text-blue-800">Полных дней:</span>
                    <span className="font-bold text-blue-900">{shiftsForMonth.filter(s => s.is_full_day).length}</span>
                  </div>
                  <div className="flex justify-between text-sm bg-white/50 px-3 py-2 rounded-lg">
                    <span className="text-blue-800">Неполных дней:</span>
                    <span className="font-bold text-blue-900">{shiftsForMonth.filter(s => !s.is_full_day).length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Блок Форма (Google Forms) */}
            <div className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 ${activeTab !== 'form' ? 'hidden md:block' : 'block'}`}>
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <MessageSquare className="mr-2 h-5 w-5 text-indigo-500" />
                Обратная связь
              </h3>
              <div className="w-full h-[590px] rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                <iframe 
                  src="https://docs.google.com/forms/d/e/1FAIpQLSczZC5_pSsbgQrjhKpfis9K0kBD6qLMWa6gWn11brFQ-v-YNQ/viewform?embedded=true" 
                  width="100%" 
                  height="100%" 
                  frameBorder="0" 
                  marginHeight={0} 
                  marginWidth={0}
                  className="w-full h-full"
                >
                  Загрузка…
                </iframe>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Модальное окно добавления смены */}
      {selectedDateToAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">
                Добавить смену: {format(selectedDateToAdd, 'dd.MM.yyyy')}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-xl transition">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleAddShift} className="space-y-5">
                
                {/* Выбор типа смены */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setShiftType('full')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                      shiftType === 'full' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Полная смена
                  </button>
                  <button
                    type="button"
                    onClick={() => setShiftType('partial')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                      shiftType === 'partial' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Неполная смена
                  </button>
                </div>

                {shiftType === 'partial' && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="bg-yellow-50 text-yellow-800 text-xs p-3 rounded-xl border border-yellow-200/60 flex gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-600" />
                      <p>Для создания графика работы используются алгоритмы, приоритет которых отдается всегда полной смене.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                          <Clock className="h-3 w-3 mr-1 text-gray-400"/> Начало
                        </label>
                        <select
                          required
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                        >
                          {START_TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                          <Clock className="h-3 w-3 mr-1 text-gray-400"/> Окончание
                        </label>
                        <select
                          required
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                        >
                          {END_TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {formError && (
                  <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200/60">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingShift}
                  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm shadow-blue-200 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {savingShift ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Добавить смену'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Подвал с динамической информацией */}
      <div className="mt-auto px-4 py-8 flex flex-col items-center justify-center text-center space-y-2 border-t border-gray-200/60 bg-white/50">
        <div className="text-xs text-gray-500 font-medium">
          Hand-coded by AlBars • Vite build: <span className="font-mono text-green-500 font-bold bg-green-50 px-1.5 py-0.5 rounded shadow-sm border border-green-100">{ping} ms</span> • Supabase realtime • Host: GitHub Pages • DB: PostgreSQL
        </div>
        <div className="text-xs text-gray-400">
          DeepSeek • Claude Sonnet 4-6 • Gemini 3.1 Pro Preview • ChatGPT • Qwen
        </div>
        <div className="text-[11px] text-gray-400 italic font-medium opacity-70">
          Ни один искусственный интеллект не пострадал при создании
        </div>
      </div>

      {/* Мобильное нижнее меню */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 px-6 pb-6 flex justify-between items-center z-40 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <button
          onClick={() => setActiveTab('info')}
          className={`flex flex-col items-center p-2 transition ${activeTab === 'info' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Info className="h-6 w-6 mb-1" />
          <span className="text-[10px] font-medium">Инфо</span>
        </button>
        
        <button
          onClick={() => setActiveTab('shifts')}
          className="relative -top-5 flex flex-col items-center group"
        >
          <div className={`h-14 w-14 rounded-full flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-105 group-active:scale-95 ${activeTab === 'shifts' ? 'bg-blue-600 shadow-blue-300' : 'bg-gray-800 shadow-gray-300'}`}>
            <Calendar className="h-6 w-6" />
          </div>
          <span className={`text-[11px] font-bold mt-1 ${activeTab === 'shifts' ? 'text-blue-600' : 'text-gray-800'}`}>Смены</span>
        </button>

        <button
          onClick={() => setActiveTab('form')}
          className={`flex flex-col items-center p-2 transition ${activeTab === 'form' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <MessageSquare className="h-6 w-6 mb-1" />
          <span className="text-[10px] font-medium">Форма</span>
        </button>
      </div>

    </div>
  );
}

// Entry point wrapper to render the app independently
export default function App() {
  const dummyProfile = {
    id: 'user-1',
    full_name: 'Сотрудник Тестов',
    age: 25,
  };

  return <EmployeeDashboard profile={dummyProfile} />;
}
