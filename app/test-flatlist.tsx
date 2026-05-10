import { Text, View } from 'react-native';
import { FlatList } from 'react-native';

export default function TestFlatList() {
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={[]}
        renderItem={() => <Text>test</Text>}
      />
    </View>
  );
}
