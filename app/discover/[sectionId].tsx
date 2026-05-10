import { Text, View, Pressable } from 'react-native';
import { useState } from 'react';

// Bypass all wrappers by importing the vendor implementation directly
const FlatList = require('react-native-web/dist/vendor/react-native/FlatList').default;

export default function DiscoverSection() {
  const [show, setShow] = useState(false);
  
  console.log('VENDOR FLATLIST TYPE:', typeof FlatList);
  console.log('VENDOR FLATLIST RENDER:', typeof FlatList?.prototype?.render);
  
  if (!show) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Pressable onPress={() => setShow(true)} style={{ padding: 20, backgroundColor: 'blue' }}>
          <Text style={{ color: 'white' }}>Render FlatList</Text>
        </Pressable>
      </View>
    );
  }
  
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={[]}
        renderItem={() => <Text>test</Text>}
      />
    </View>
  );
}
