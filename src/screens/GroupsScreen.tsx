import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack'; // Import StackNavigationProp
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { RootStackParamList } from '../navigation/AppNavigator'; // Corrected import path
import { supabase } from '../supabase'; // Adjust path if needed

interface Group {
    id: string;
    name: string;
    description: string;
}

// Define the expected structure from the Supabase query result item
interface MembershipData {
    groups: Group | null; // The nested group object, potentially null
}

type GroupsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Main'>;

const GroupsScreen = () => {
    const [groups, setGroups] = useState<Group[]>([]);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDescription, setNewGroupDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const navigation = useNavigation<GroupsScreenNavigationProp>();

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();

            if (userError || !user) {
                // ... (handle user error)
                setGroups([]);
                return;
            }

            // --- Fetch data and use .returns<T[]>() ---
            const { data: membershipData, error: fetchError } = await supabase
                .from('group_members')
                .select(`groups ( id, name, description )`)
                .eq('user_id', user.id)
                .returns<MembershipData[]>(); // <--- Tell Supabase the expected return type

            if (fetchError) {
                console.error('Error fetching groups:', fetchError);
                Alert.alert('Error fetching groups', fetchError.message);
            } else {
                // --- Use map and a type guard filter ---
                const extractedGroups = membershipData
                        ?.map(item => item.groups) // Result is (Group | null)[] | undefined
                        .filter((group): group is Group => group !== null) // Filter out nulls AND assert type
                    || []; // Provide default empty array if membershipData was null
                setGroups(extractedGroups); // Now correctly typed as Group[]
            }
        } catch (error: any) {
            // ... (handle unexpected error)
        } finally {
            setLoading(false);
        }
    }, []);

    // ... rest of the component remains the same (useEffect, handleCreateGroup, renderItem, return)
    // Make sure handleCreateGroup also uses await supabase.auth.getUser() correctly

    useEffect(() => {
        fetchGroups();
        const unsubscribe = navigation.addListener('focus', fetchGroups);
        return unsubscribe;
    }, [fetchGroups, navigation]);

    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || !newGroupDescription.trim()) {
            Alert.alert('Error', 'Group name and description are required.');
            return;
        }
        setIsCreating(true);
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                Alert.alert('Error', 'Could not get user session to create group.'); return;
            }
            const { data: newGroup, error: groupError } = await supabase
                .from('groups')
                .insert({ name: newGroupName.trim(), description: newGroupDescription.trim(), owner_id: user.id })
                .select()
                .single();
            if (groupError) { Alert.alert('Error creating group', groupError.message); return; }
            if (newGroup) {
                const { error: memberError } = await supabase
                    .from('group_members')
                    .insert({ group_id: newGroup.id, user_id: user.id });
                if (memberError) { Alert.alert('Error adding user to group', memberError.message); }
                else {
                    Alert.alert('Success', `Group "${newGroupName.trim()}" created!`);
                    setNewGroupName(''); setNewGroupDescription('');
                    fetchGroups(); // Refresh list
                }
            }
        } catch (error: any) { Alert.alert('Error', 'An unexpected error occurred.'); }
        finally { setIsCreating(false); }
    };

    const renderItem = ({ item }: { item: Group }) => (
        <View style={styles.groupItem}>
            <Text style={styles.groupName}>{item.name}</Text>
            <Text>{item.description}</Text>
            <View style={styles.buttonContainer}>
                <Button
                    title="Find Matches"
                    onPress={() => navigation.navigate('Matching', { currentGroupId: item.id, currentGroupName: item.name })}
                />
                <Button
                    title="Chat"
                    onPress={() => navigation.navigate('Chat', { groupId: item.id, groupName: item.name })}
                />
                <Button
                    title="Add User"
                    onPress={() => navigation.navigate('AddUserToGroup', { groupId: item.id, groupName: item.name })}
                />
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Your Groups</Text>
            {loading && groups.length === 0 ? (
                <ActivityIndicator size="large" color="#0000ff" />
            ) : (
                <FlatList
                    data={groups}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    ListEmptyComponent={<Text style={styles.emptyText}>You haven't joined any groups yet.</Text>}
                    refreshing={loading}
                    onRefresh={fetchGroups}
                />
            )}
            <Text style={styles.subtitle}>Create New Group</Text>
            <TextInput style={styles.input} placeholder="Group Name" value={newGroupName} onChangeText={setNewGroupName} editable={!isCreating} />
            <TextInput style={styles.input} placeholder="Group Description" value={newGroupDescription} onChangeText={setNewGroupDescription} editable={!isCreating} />
            <Button title={isCreating ? "Creating..." : "Create Group"} onPress={handleCreateGroup} disabled={isCreating} />
        </View>
    );
};
// --- Styles remain the same ---
const styles = StyleSheet.create({ /* ... styles ... */
    container: { flex: 1, padding: 20, },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 15, },
    subtitle: { fontSize: 18, fontWeight: 'bold', marginTop: 30, marginBottom: 10, },
    groupItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff', marginBottom: 5, borderRadius: 5, },
    groupName: { fontSize: 16, fontWeight: 'bold', marginBottom: 5, },
    input: { height: 45, borderColor: '#ccc', borderWidth: 1, marginBottom: 10, paddingHorizontal: 10, borderRadius: 5, backgroundColor: '#fff', },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: 'gray', },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 10,
    }
});


export default GroupsScreen;