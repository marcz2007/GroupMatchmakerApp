import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Modal,
  Platform,
  SafeAreaView,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { GOOGLE_PLACES_API_KEY } from "@env";
import { colors, spacing, borderRadius } from "../../theme";

// Native-only imports — conditionally loaded at runtime
const DateTimePicker = Platform.OS !== "web"
  ? require("@react-native-community/datetimepicker").default
  : null;
const GooglePlacesAutocomplete = Platform.OS !== "web"
  ? require("react-native-google-places-autocomplete").GooglePlacesAutocomplete
  : null;

/* ─── Web Calendar Picker ─── */
const DAYS_OF_WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WebCalendar: React.FC<{
  selected: Date | null;
  onSelect: (d: Date) => void;
  minimumDate?: Date;
}> = ({ selected, onSelect, minimumDate }) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  const minDate = minimumDate || today;

  const cells = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
    const rows: Array<Array<{ day: number; disabled: boolean } | null>> = [];
    let row: Array<{ day: number; disabled: boolean } | null> = [];

    // Leading blanks
    for (let i = 0; i < firstDay; i++) row.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(viewYear, viewMonth, d);
      const disabled =
        cellDate.getFullYear() < minDate.getFullYear() ||
        (cellDate.getFullYear() === minDate.getFullYear() &&
          cellDate.getMonth() < minDate.getMonth()) ||
        (cellDate.getFullYear() === minDate.getFullYear() &&
          cellDate.getMonth() === minDate.getMonth() &&
          cellDate.getDate() < minDate.getDate());
      row.push({ day: d, disabled });
      if (row.length === 7) {
        rows.push(row);
        row = [];
      }
    }
    if (row.length > 0) {
      while (row.length < 7) row.push(null);
      rows.push(row);
    }
    return rows;
  }, [viewYear, viewMonth, minDate]);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const prevDisabled =
    viewYear < minDate.getFullYear() ||
    (viewYear === minDate.getFullYear() && viewMonth <= minDate.getMonth());

  return (
    <View style={calStyles.container}>
      {/* Month nav */}
      <View style={calStyles.header}>
        <TouchableOpacity onPress={goPrev} disabled={prevDisabled} style={calStyles.navBtn}>
          <Text style={[calStyles.navText, prevDisabled && { opacity: 0.3 }]}>‹</Text>
        </TouchableOpacity>
        <Text style={calStyles.monthLabel}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={goNext} style={calStyles.navBtn}>
          <Text style={calStyles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={calStyles.row}>
        {DAYS_OF_WEEK.map((d, i) => (
          <View key={i} style={calStyles.cell}>
            <Text style={calStyles.dowText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {cells.map((week, wi) => (
        <View key={wi} style={calStyles.row}>
          {week.map((cell, ci) => {
            if (!cell) return <View key={ci} style={calStyles.cell} />;
            const cellDate = new Date(viewYear, viewMonth, cell.day);
            const isSelected = selected && isSameDay(cellDate, selected);
            const isToday = isSameDay(cellDate, today);
            return (
              <TouchableOpacity
                key={ci}
                style={calStyles.cell}
                disabled={cell.disabled}
                onPress={() => onSelect(cellDate)}
              >
                <View
                  style={[
                    calStyles.dayCircle,
                    isSelected && calStyles.daySelected,
                    isToday && !isSelected && calStyles.dayToday,
                  ]}
                >
                  <Text
                    style={[
                      calStyles.dayText,
                      cell.disabled && calStyles.dayDisabled,
                      isSelected && calStyles.daySelectedText,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const calStyles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  navBtn: { padding: spacing.sm },
  navText: { fontSize: 24, color: colors.text.primary, fontWeight: "600" },
  monthLabel: { fontSize: 16, fontWeight: "600", color: colors.text.primary },
  row: { flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  dowText: { fontSize: 12, color: colors.text.tertiary, fontWeight: "600" },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { fontSize: 14, color: colors.text.primary },
  dayDisabled: { color: colors.text.tertiary, opacity: 0.4 },
  daySelected: { backgroundColor: colors.primary },
  daySelectedText: { color: colors.white, fontWeight: "700" },
  dayToday: { borderWidth: 1, borderColor: colors.primary },
});

/* ─── Web Time Picker ─── */
const WebTimePicker: React.FC<{
  selected: Date | null;
  onSelect: (d: Date) => void;
}> = ({ selected, onSelect }) => {
  const initial = selected || new Date();
  const initialHour12 = initial.getHours() % 12 || 12;
  const initialAmPm = initial.getHours() >= 12 ? "PM" : "AM";

  const [hour, setHour] = useState(initialHour12);
  const [minute, setMinute] = useState(initial.getMinutes());
  const [amPm, setAmPm] = useState<"AM" | "PM">(initialAmPm);

  const commit = (h: number, m: number, ap: "AM" | "PM") => {
    const d = new Date();
    let h24 = h === 12 ? 0 : h;
    if (ap === "PM") h24 += 12;
    d.setHours(h24, m, 0, 0);
    onSelect(d);
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <View style={timeStyles.container}>
      <View style={timeStyles.columns}>
        {/* Hour */}
        <View style={timeStyles.column}>
          <Text style={timeStyles.colLabel}>Hour</Text>
          <ScrollView style={timeStyles.scroll} showsVerticalScrollIndicator={false}>
            {hours.map((h) => (
              <TouchableOpacity
                key={h}
                style={[timeStyles.option, hour === h && timeStyles.optionSelected]}
                onPress={() => { setHour(h); commit(h, minute, amPm); }}
              >
                <Text style={[timeStyles.optionText, hour === h && timeStyles.optionTextSelected]}>
                  {h}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Minute */}
        <View style={timeStyles.column}>
          <Text style={timeStyles.colLabel}>Min</Text>
          <ScrollView style={timeStyles.scroll} showsVerticalScrollIndicator={false}>
            {minutes.map((m) => (
              <TouchableOpacity
                key={m}
                style={[timeStyles.option, minute === m && timeStyles.optionSelected]}
                onPress={() => { setMinute(m); commit(hour, m, amPm); }}
              >
                <Text style={[timeStyles.optionText, minute === m && timeStyles.optionTextSelected]}>
                  {String(m).padStart(2, "0")}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* AM / PM */}
        <View style={timeStyles.column}>
          <Text style={timeStyles.colLabel}>{" "}</Text>
          <View style={timeStyles.amPmCol}>
            {(["AM", "PM"] as const).map((v) => (
              <TouchableOpacity
                key={v}
                style={[timeStyles.option, timeStyles.amPmOption, amPm === v && timeStyles.optionSelected]}
                onPress={() => { setAmPm(v); commit(hour, minute, v); }}
              >
                <Text style={[timeStyles.optionText, amPm === v && timeStyles.optionTextSelected]}>
                  {v}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const timeStyles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  columns: { flexDirection: "row", gap: spacing.sm },
  column: { flex: 1, alignItems: "center" },
  colLabel: { fontSize: 12, color: colors.text.tertiary, fontWeight: "600", marginBottom: spacing.xs },
  scroll: { maxHeight: 200 },
  amPmCol: { gap: spacing.xs },
  option: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    minWidth: 52,
  },
  optionSelected: {
    backgroundColor: colors.primary,
  },
  amPmOption: {
    paddingVertical: 14,
  },
  optionText: { fontSize: 16, color: colors.text.secondary },
  optionTextSelected: { color: colors.white, fontWeight: "700" },
});

interface DetailChipsProps {
  date: Date | null;
  time: Date | null;
  location: string;
  onDateChange: (date: Date | null) => void;
  onTimeChange: (time: Date | null) => void;
  onLocationChange: (location: string) => void;
  minimumDate?: Date;
}

export const DetailChips: React.FC<DetailChipsProps> = ({
  date,
  time,
  location,
  onDateChange,
  onTimeChange,
  onLocationChange,
  minimumDate,
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Temp values for pickers - allows "Done" to work without changing value
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [tempTime, setTempTime] = useState<Date>(new Date());

  const formatDate = (d: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) {
      return "Today";
    } else if (d.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    }
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (t: Date) => {
    return t.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const openDatePicker = () => {
    if (Platform.OS === "web") {
      setShowDatePicker(true);
    } else {
      setTempDate(date || new Date());
      setShowDatePicker(true);
    }
  };

  const openTimePicker = () => {
    if (Platform.OS === "web") {
      setShowTimePicker(true);
    } else {
      setTempTime(time || new Date());
      setShowTimePicker(true);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && selectedDate) {
        onDateChange(selectedDate);
      }
    } else if (selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
      if (event.type === "set" && selectedTime) {
        onTimeChange(selectedTime);
      }
    } else if (selectedTime) {
      setTempTime(selectedTime);
    }
  };

  const handleDateDone = () => {
    onDateChange(tempDate);
    setShowDatePicker(false);
  };

  const handleTimeDone = () => {
    onTimeChange(tempTime);
    setShowTimePicker(false);
  };

  const clearDate = () => onDateChange(null);
  const clearTime = () => onTimeChange(null);
  const clearLocation = () => onLocationChange("");

  return (
    <View style={styles.container}>
      {/* Date Chip */}
      <TouchableOpacity
        style={[styles.chip, date && styles.chipFilled]}
        onPress={openDatePicker}
        activeOpacity={0.7}
      >
        <Text style={styles.chipIcon}>📅</Text>
        <Text style={[styles.chipText, date && styles.chipTextFilled]}>
          {date ? formatDate(date) : "Add date"}
        </Text>
        {date && (
          <TouchableOpacity onPress={clearDate} style={styles.clearButton}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Time Chip */}
      <TouchableOpacity
        style={[styles.chip, time && styles.chipFilled]}
        onPress={openTimePicker}
        activeOpacity={0.7}
      >
        <Text style={styles.chipIcon}>🕐</Text>
        <Text style={[styles.chipText, time && styles.chipTextFilled]}>
          {time ? formatTime(time) : "Add time"}
        </Text>
        {time && (
          <TouchableOpacity onPress={clearTime} style={styles.clearButton}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Location Chip */}
      <TouchableOpacity
        style={[styles.chip, styles.chipWide, location && styles.chipFilled]}
        onPress={() => setShowLocationModal(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.chipIcon}>📍</Text>
        <Text
          style={[styles.chipText, location && styles.chipTextFilled]}
          numberOfLines={1}
        >
          {location || "Add location"}
        </Text>
        {location && (
          <TouchableOpacity onPress={clearLocation} style={styles.clearButton}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Web Date Picker — custom calendar */}
      {Platform.OS === "web" && showDatePicker && (
        <Modal transparent animationType="fade">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Select Date</Text>
                <View style={{ width: 50 }} />
              </View>
              <WebCalendar
                selected={date}
                minimumDate={minimumDate}
                onSelect={(d) => {
                  onDateChange(d);
                  setShowDatePicker(false);
                }}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* iOS Date Picker Modal */}
      {Platform.OS === "ios" && showDatePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Select Date</Text>
                <TouchableOpacity onPress={handleDateDone}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                minimumDate={minimumDate || new Date()}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Date Picker */}
      {Platform.OS === "android" && showDatePicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Web Time Picker — custom hour/min/am-pm columns */}
      {Platform.OS === "web" && showTimePicker && (
        <Modal transparent animationType="fade">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Select Time</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <WebTimePicker
                selected={time}
                onSelect={(t) => onTimeChange(t)}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* iOS Time Picker Modal */}
      {Platform.OS === "ios" && showTimePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Select Time</Text>
                <TouchableOpacity onPress={handleTimeDone}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Time Picker */}
      {Platform.OS === "android" && showTimePicker && (
        <DateTimePicker
          value={tempTime}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}

      {/* Location Modal */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <SafeAreaView style={styles.locationModalContainer}>
          <View style={styles.locationHeader}>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Location</Text>
            <View style={{ width: 50 }} />
          </View>
          <KeyboardAvoidingView
            style={styles.locationContent}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {Platform.OS === "web" ? (
              <View style={styles.webLocationContainer}>
                <TextInput
                  style={styles.webLocationInput}
                  placeholder="Enter location..."
                  placeholderTextColor={colors.text.tertiary}
                  value={location}
                  onChangeText={onLocationChange}
                  autoFocus
                  onSubmitEditing={() => setShowLocationModal(false)}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.webLocationDone}
                  onPress={() => setShowLocationModal(false)}
                >
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <GooglePlacesAutocomplete
                placeholder="Search for a place..."
                onPress={(data: any) => {
                  onLocationChange(data.description);
                  setShowLocationModal(false);
                }}
                query={{
                  key: GOOGLE_PLACES_API_KEY,
                  language: "en",
                }}
                fetchDetails={false}
                enablePoweredByContainer={false}
                debounce={300}
                minLength={2}
                keyboardShouldPersistTaps="handled"
                textInputProps={{
                  autoFocus: true,
                  placeholderTextColor: colors.text.tertiary,
                }}
                styles={{
                  container: {
                    flex: 1,
                    backgroundColor: colors.surface,
                  },
                  textInputContainer: {
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.lg,
                    paddingTop: spacing.md,
                  },
                  textInput: {
                    backgroundColor: colors.surfaceLight,
                    borderRadius: borderRadius.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.md,
                    fontSize: 16,
                    color: colors.text.primary,
                    height: 48,
                  },
                  listView: {
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.lg,
                  },
                  row: {
                    backgroundColor: colors.surface,
                    paddingVertical: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                  description: {
                    color: colors.text.primary,
                    fontSize: 15,
                  },
                  separator: {
                    height: 0,
                  },
                }}
              />
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderStyle: "dashed",
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chipFilled: {
    backgroundColor: "rgba(87, 98, 183, 0.2)",
    borderColor: "rgba(87, 98, 183, 0.4)",
    borderStyle: "solid",
  },
  chipWide: {
    minWidth: 170,
  },
  chipIcon: {
    fontSize: 18,
  },
  chipText: {
    fontSize: 17,
    color: colors.text.tertiary,
  },
  chipTextFilled: {
    color: colors.text.primary,
    fontWeight: "500",
  },
  clearButton: {
    marginLeft: spacing.xs,
    padding: 4,
  },
  clearText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  pickerModal: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingBottom: spacing.xl,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  pickerCancel: {
    fontSize: 16,
    color: colors.text.tertiary,
  },
  pickerDone: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  locationModalContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  locationContent: {
    flex: 1,
  },
  webLocationContainer: {
    padding: spacing.lg,
  },
  webLocationInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text.primary,
    height: 48,
    marginBottom: spacing.md,
  },
  webLocationDone: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
});
