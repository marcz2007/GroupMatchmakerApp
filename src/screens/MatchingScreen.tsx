// src/screens/MatchingScreen.tsx
import { RouteProp, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase } from '../supabase'; // Adjust path if needed

// Define the type for the route parameters expected by this screen
type MatchingScreenRouteProp = RouteProp<RootStackParamList, 'Matching'>;

// Define a simple type for the potential group data
interface PotentialGroup {
    id: string;
    name: string;
    description: string;
}

const MatchingScreen = () => {
    const route = useRoute<MatchingScreenRouteProp>();
    const { currentGroupId, currentGroupName } = route.params; // Get the passed group ID

    const [potentialGroups, setPotentialGroups] = useState<PotentialGroup[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSwiping, setIsSwiping] = useState(false); // Loading state for swipe action

    // Fetch potential groups when the screen mounts or currentGroupId changes
    useEffect(() => {
        fetchPotentialMatches();
    }, [currentGroupId]);

    const fetchPotentialMatches = useCallback(async () => {
        setIsLoading(true);
        setPotentialGroups([]); // Clear previous groups while loading
        try {
            // Fetch groups that are NOT the current group
            // MVP: Doesn't filter out already swiped/matched groups yet
            const { data, error } = await supabase
                .from('groups')
                .select('id, name, description')
                .neq('id', currentGroupId) // Don't show the current group
                .limit(20); // Limit the number fetched for performance

            if (error) {
                throw error;
            }
            setPotentialGroups(data || []);

        } catch (error: any) {
            console.error("Error fetching potential matches:", error);
            Alert.alert('Error', 'Could not load groups to match with.');
        } finally {
            setIsLoading(false);
        }
    }, [currentGroupId]);

    const handleSwipe = async (targetGroupId: string, liked: boolean) => {
        setIsSwiping(true);
        try {
            // Ensure user is fetched correctly before invoking function if needed by RLS on function call (less common)
            // const { data: { user } } = await supabase.auth.getUser();
            // if (!user) throw new Error("User not authenticated");

            console.log(`Swiping on group ${targetGroupId} from ${currentGroupId}, Liked: ${liked}`);

            // Call the Supabase Edge Function
            const { data, error } = await supabase.functions.invoke('record-swipe', {
                body: {
                    initiating_group_id: currentGroupId,
                    target_group_id: targetGroupId,
                    liked: liked,
                },
            });

            if (error) throw error; // Handle network/invocation errors
            if (data?.error) throw new Error(data.error); // Handle errors returned from function logic

            // Swipe successful, remove the swiped group from the list for this session
            setPotentialGroups(prevGroups => prevGroups.filter(group => group.id !== targetGroupId));
            Alert.alert('Swipe Recorded!', data?.message || ''); // Show success from function response

        } catch (error: any) {
            console.error("Swipe Error:", error);
            Alert.alert('Error', `Failed to record swipe: ${error.message}`);
        } finally {
            setIsSwiping(false);
        }
    };

    const renderPotentialMatch = ({ item }: { item: PotentialGroup }) => (
        <View style={styles.card}>
            <Text style={styles.groupName}>{item.name}</Text>
            <Text style={styles.groupDescription}>{item.description}</Text>
            <View style={styles.buttonRow}>
                <Button
                    title="Nope"
                    onPress={() => handleSwipe(item.id, false)}
                    disabled={isSwiping}
                    color="#ff6961" // Reddish color
                />
                <Button
                    title="Like"
                    onPress={() => handleSwipe(item.id, true)}
                    disabled={isSwiping}
                    color="#77dd77" // Greenish color
                />
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Find Matches for "{currentGroupName}"</Text>

            {isLoading ? (
                <ActivityIndicator size="large" color="#0000ff" />
            ) : (
                <FlatList
                    data={potentialGroups}
                    renderItem={renderPotentialMatch}
                    keyExtractor={(item) => item.id}
                    ListEmptyComponent={<Text style={styles.emptyText}>No more groups to match with right now.</Text>}
                    contentContainerStyle={potentialGroups.length === 0 ? styles.emptyListContainer : null}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 15,
        backgroundColor: '#f8f8f8',
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 15,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 3,
    },
    groupName: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    groupDescription: {
        fontSize: 14,
        color: '#555',
        marginBottom: 15,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 10,
    },
    emptyText: {
        textAlign: 'center',
        fontSize: 16,
        color: 'gray',
    },
    emptyListContainer: {
        flex: 1, // Make empty text center if list takes full height
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default MatchingScreen;