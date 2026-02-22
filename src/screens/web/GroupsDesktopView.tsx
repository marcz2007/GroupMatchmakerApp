import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import GroupsScreen from "../GroupsScreen";
import GroupDetailsScreen from "../GroupDetailsScreen";
import EmptyDetailView from "../../components/web/EmptyDetailView";
import { colors } from "../../theme";

const GroupsDesktopView = () => {
  const [selectedGroup, setSelectedGroup] = useState<{
    id: string;
    name: string;
  } | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.listPanel}>
        <GroupsScreen
          onSelectGroup={setSelectedGroup}
          selectedGroupId={selectedGroup?.id}
        />
      </View>
      <View style={styles.detailPanel}>
        {selectedGroup ? (
          <GroupDetailsScreen
            groupIdProp={selectedGroup.id}
            groupNameProp={selectedGroup.name}
            isDesktopPane
          />
        ) : (
          <EmptyDetailView
            message="Select a group to view details"
            icon="grid-outline"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  listPanel: {
    width: 350,
    borderRightWidth: 1,
    borderRightColor: colors.divider,
  },
  detailPanel: {
    flex: 1,
  },
});

export default GroupsDesktopView;
