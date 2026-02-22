import React, { useState } from "react";
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

      {/* Web Date Picker */}
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
              <View style={styles.webPickerContent}>
                <input
                  type="date"
                  defaultValue={date ? date.toISOString().split("T")[0] : ""}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e: any) => {
                    if (e.target.value) {
                      onDateChange(new Date(e.target.value + "T00:00:00"));
                      setShowDatePicker(false);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: 12,
                    fontSize: 18,
                    backgroundColor: "#2a2a3e",
                    color: "#ffffff",
                    border: "1px solid #404060",
                    borderRadius: 8,
                  }}
                />
              </View>
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

      {/* Web Time Picker */}
      {Platform.OS === "web" && showTimePicker && (
        <Modal transparent animationType="fade">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Select Time</Text>
                <View style={{ width: 50 }} />
              </View>
              <View style={styles.webPickerContent}>
                <input
                  type="time"
                  defaultValue={time ? `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}` : ""}
                  onChange={(e: any) => {
                    if (e.target.value) {
                      const [hours, minutes] = e.target.value.split(":").map(Number);
                      const newTime = new Date();
                      newTime.setHours(hours, minutes, 0, 0);
                      onTimeChange(newTime);
                      setShowTimePicker(false);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: 12,
                    fontSize: 18,
                    backgroundColor: "#2a2a3e",
                    color: "#ffffff",
                    border: "1px solid #404060",
                    borderRadius: 8,
                  }}
                />
              </View>
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
  webPickerContent: {
    padding: spacing.lg,
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
