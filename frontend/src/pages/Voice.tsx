import React, { useState, useEffect, useRef } from 'react';
import { MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid';

interface VoiceCommand {
  id: string;
  command: string;
  action: string;
  timestamp: Date;
  result?: string;
  error?: string;
}

interface Equipment {
  id: string;
  name: string;
  serialNumber: string;
  qrCode: string;
  status: 'AVAILABLE' | 'CHECKED_OUT' | 'MAINTENANCE';
}

const Voice: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [commands, setCommands] = useState<VoiceCommand[]>([]);
  const [isSupported, setIsSupported] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if browser supports Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          setTranscript(finalTranscript);
          processVoiceCommand(finalTranscript.trim());
        } else {
          setTranscript(interimTranscript);
        }
      };
      
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
    
    // Fetch equipment data
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/equipment', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setEquipment(data.equipment || []);
      }
    } catch (error) {
      console.error('Failed to fetch equipment:', error);
    }
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      setTranscript('');
      recognitionRef.current.start();
      
      // Auto-stop after 10 seconds
      timeoutRef.current = setTimeout(() => {
        stopListening();
      }, 10000);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  };

  const processVoiceCommand = async (command: string) => {
    const lowerCommand = command.toLowerCase();
    const commandId = Date.now().toString();
    
    // Create command record
    const voiceCommand: VoiceCommand = {
      id: commandId,
      command: command,
      action: 'Processing...',
      timestamp: new Date()
    };
    
    setCommands(prev => [voiceCommand, ...prev]);
    setLoading(true);

    try {
      // Parse different voice commands
      if (lowerCommand.includes('check out') || lowerCommand.includes('checkout')) {
        await handleCheckoutCommand(lowerCommand, commandId);
      } else if (lowerCommand.includes('check in') || lowerCommand.includes('checkin')) {
        await handleCheckinCommand(lowerCommand, commandId);
      } else if (lowerCommand.includes('find') || lowerCommand.includes('search')) {
        await handleSearchCommand(lowerCommand, commandId);
      } else if (lowerCommand.includes('list') || lowerCommand.includes('show')) {
        await handleListCommand(lowerCommand, commandId);
      } else if (lowerCommand.includes('status')) {
        await handleStatusCommand(lowerCommand, commandId);
      } else {
        updateCommand(commandId, 'Unknown command', `Sorry, I don't understand "${command}". Try saying "check out [equipment name]", "check in [equipment name]", "find [equipment name]", or "list all equipment".`);
      }
    } catch (error) {
      updateCommand(commandId, 'Error', `Failed to process command: ${error}`);
    } finally {
      setLoading(false);
      stopListening();
    }
  };

  const updateCommand = (commandId: string, action: string, result?: string, error?: string) => {
    setCommands(prev => prev.map(cmd => 
      cmd.id === commandId 
        ? { ...cmd, action, result, error }
        : cmd
    ));
  };

  const findEquipmentByName = (name: string): Equipment | null => {
    const normalizedName = name.toLowerCase();
    return equipment.find(eq => 
      eq.name.toLowerCase().includes(normalizedName) ||
      eq.serialNumber.toLowerCase().includes(normalizedName) ||
      eq.qrCode.toLowerCase().includes(normalizedName)
    ) || null;
  };

  const handleCheckoutCommand = async (command: string, commandId: string) => {
    // Extract equipment name from command like "check out basketball" or "checkout soccer ball"
    const match = command.match(/check\s*out\s+(.+)/);
    if (!match) {
      updateCommand(commandId, 'Check Out Failed', 'Could not understand equipment name. Try saying "check out [equipment name]".');
      return;
    }
    
    const equipmentName = match[1].trim();
    const foundEquipment = findEquipmentByName(equipmentName);
    
    if (!foundEquipment) {
      updateCommand(commandId, 'Check Out Failed', `Equipment "${equipmentName}" not found. Please check the name and try again.`);
      return;
    }
    
    if (foundEquipment.status !== 'AVAILABLE') {
      updateCommand(commandId, 'Check Out Failed', `Equipment "${foundEquipment.name}" is currently ${foundEquipment.status.toLowerCase().replace('_', ' ')}.`);
      return;
    }
    
    // For voice commands, we'll assign to "Voice User" - in a real app you might ask for user name
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/equipment/${foundEquipment.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userName: 'Voice User',
          notes: 'Checked out via voice command'
        })
      });
      
      if (response.ok) {
        updateCommand(commandId, 'Check Out Success', `Successfully checked out "${foundEquipment.name}" to Voice User.`);
        fetchEquipment(); // Refresh equipment list
      } else {
        throw new Error('API request failed');
      }
    } catch (error) {
      updateCommand(commandId, 'Check Out Failed', `Failed to check out equipment: ${error}`);
    }
  };

  const handleCheckinCommand = async (command: string, commandId: string) => {
    // Extract equipment name from command like "check in basketball"
    const match = command.match(/check\s*in\s+(.+)/);
    if (!match) {
      updateCommand(commandId, 'Check In Failed', 'Could not understand equipment name. Try saying "check in [equipment name]".');
      return;
    }
    
    const equipmentName = match[1].trim();
    const foundEquipment = findEquipmentByName(equipmentName);
    
    if (!foundEquipment) {
      updateCommand(commandId, 'Check In Failed', `Equipment "${equipmentName}" not found. Please check the name and try again.`);
      return;
    }
    
    if (foundEquipment.status !== 'CHECKED_OUT') {
      updateCommand(commandId, 'Check In Failed', `Equipment "${foundEquipment.name}" is not currently checked out.`);
      return;
    }
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/equipment/${foundEquipment.id}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          condition: 'GOOD',
          notes: 'Checked in via voice command'
        })
      });
      
      if (response.ok) {
        updateCommand(commandId, 'Check In Success', `Successfully checked in "${foundEquipment.name}".`);
        fetchEquipment(); // Refresh equipment list
      } else {
        throw new Error('API request failed');
      }
    } catch (error) {
      updateCommand(commandId, 'Check In Failed', `Failed to check in equipment: ${error}`);
    }
  };

  const handleSearchCommand = async (command: string, commandId: string) => {
    // Extract search term from command like "find basketball" or "search for soccer"
    const match = command.match(/(?:find|search\s+for?)\s+(.+)/);
    if (!match) {
      updateCommand(commandId, 'Search Failed', 'Could not understand search term. Try saying "find [equipment name]".');
      return;
    }
    
    const searchTerm = match[1].trim();
    const results = equipment.filter(eq => 
      eq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.qrCode.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (results.length === 0) {
      updateCommand(commandId, 'Search Results', `No equipment found matching "${searchTerm}".`);
    } else if (results.length === 1) {
      const eq = results[0];
      updateCommand(commandId, 'Search Results', `Found "${eq.name}" (${eq.serialNumber}) - Status: ${eq.status.replace('_', ' ')}`);
    } else {
      const resultNames = results.slice(0, 3).map(eq => eq.name).join(', ');
      const additional = results.length > 3 ? ` and ${results.length - 3} more` : '';
      updateCommand(commandId, 'Search Results', `Found ${results.length} items: ${resultNames}${additional}`);
    }
  };

  const handleListCommand = async (command: string, commandId: string) => {
    const available = equipment.filter(eq => eq.status === 'AVAILABLE').length;
    const checkedOut = equipment.filter(eq => eq.status === 'CHECKED_OUT').length;
    const maintenance = equipment.filter(eq => eq.status === 'MAINTENANCE').length;
    
    updateCommand(commandId, 'Equipment Summary', 
      `Total equipment: ${equipment.length}. Available: ${available}, Checked out: ${checkedOut}, In maintenance: ${maintenance}.`
    );
  };

  const handleStatusCommand = async (command: string, commandId: string) => {
    // Extract equipment name from command like "status of basketball" or "what's the status of soccer ball"
    const match = command.match(/(?:status\s+of|what'?s\s+the\s+status\s+of)\s+(.+)/);
    if (!match) {
      updateCommand(commandId, 'Status Failed', 'Could not understand equipment name. Try saying "status of [equipment name]".');
      return;
    }
    
    const equipmentName = match[1].trim();
    const foundEquipment = findEquipmentByName(equipmentName);
    
    if (!foundEquipment) {
      updateCommand(commandId, 'Status Failed', `Equipment "${equipmentName}" not found.`);
      return;
    }
    
    let statusMessage = `"${foundEquipment.name}" is currently ${foundEquipment.status.replace('_', ' ').toLowerCase()}`;
    if (foundEquipment.status === 'CHECKED_OUT') {
      statusMessage += ` to ${(foundEquipment as any).checkedOutTo || 'someone'}`;
    }
    statusMessage += '.';
    
    updateCommand(commandId, 'Equipment Status', statusMessage);
  };

  if (!isSupported) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">Voice Commands Not Supported</h2>
          <p className="text-yellow-700">
            Your browser doesn't support voice recognition. Please use a modern browser like Chrome, Edge, or Safari.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Voice Commands</h1>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          )}
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium ${
              isListening
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {isListening ? (
              <>
                <StopIcon className="w-5 h-5" />
                Stop Listening
              </>
            ) : (
              <>
                <MicrophoneIcon className="w-5 h-5" />
                Start Voice Command
              </>
            )}
          </button>
        </div>
      </div>

      {/* Current listening status */}
      {isListening && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="animate-pulse w-3 h-3 bg-red-500 rounded-full"></div>
            <h3 className="font-semibold text-blue-900">Listening...</h3>
          </div>
          {transcript && (
            <p className="text-blue-700 italic">"{transcript}"</p>
          )}
          <p className="text-sm text-blue-600 mt-2">
            Try saying: "check out basketball", "check in soccer ball", "find tennis racket", or "list all equipment"
          </p>
        </div>
      )}

      {/* Voice command help */}
      <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Available Voice Commands</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-800">Equipment Operations</h4>
            <ul className="text-sm text-gray-600 mt-1 space-y-1">
              <li>" "Check out [equipment name]"</li>
              <li>" "Check in [equipment name]"</li>
              <li>" "Status of [equipment name]"</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">Information</h4>
            <ul className="text-sm text-gray-600 mt-1 space-y-1">
              <li>" "Find [equipment name]"</li>
              <li>" "Search for [equipment name]"</li>
              <li>" "List all equipment"</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Command history */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Command History</h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {commands.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No voice commands yet. Click "Start Voice Command" and try saying something!
            </div>
          ) : (
            commands.map((cmd) => (
              <div key={cmd.id} className="px-6 py-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-900">"{cmd.command}"</h4>
                  <span className="text-sm text-gray-500">
                    {cmd.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    cmd.result && !cmd.error
                      ? 'bg-green-100 text-green-800'
                      : cmd.error
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {cmd.action}
                  </span>
                </div>
                
                {cmd.result && (
                  <p className="text-sm text-gray-700 bg-gray-50 rounded p-2">
                    {cmd.result}
                  </p>
                )}
                
                {cmd.error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded p-2">
                    {cmd.error}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Voice;