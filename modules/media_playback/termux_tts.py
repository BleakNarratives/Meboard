#!/usr/bin/env python3
"""
[DNA_TAG]
ORIGIN: Moto4
PILLAR: dynamic_auto_tag
PATH: termux_tts.py
ROLE: Auto-tagged by Code Sentinel on directory traversal.
LAST_SYNC: 2026-08-01T19:15:00
[/DNA_TAG]
"""

#!/usr/bin/env python3
"""
TERMUX TTS - Android-compatible text-to-speech
"""
import subprocess
import os

class TermuxTTS:
    def __init__(self):
        self.available = self.check_termux_tts()
    
    def check_termux_tts(self):
        """Check if termux-tts-speak is available"""
        try:
            result = subprocess.run(['which', 'termux-tts-speak'], 
                                  capture_output=True, text=True)
            return result.returncode == 0
        except:
            return False
    
    def speak(self, text):
        """Speak text using Termux TTS"""
        if not self.available:
            print(f"🔇 [TTS]: {text}")
            return False
            
        try:
            # Clean text for shell command
            clean_text = text.replace('"', '\"').replace('$', '\$')
            cmd = f'termux-tts-speak "{clean_text}"'
            subprocess.run(cmd, shell=True, check=False)
            print(f"🔊 [TTS]: {text}")
            return True
        except Exception as e:
            print(f"🔇 [TTS Failed]: {text} - {e}")
            return False

# Global instance
tts = TermuxTTS()

if __name__ == "__main__":
    # Test the TTS
    test_messages = [
        "TTS system activated. Ready for live coding.",
        "File forensics complete.",
        "Code miner finished.",
        "Deployment successful!",
        "Error detected. Fixing syntax issues now.",
        "Celebration! All tests passing!"
    ]
    
    for msg in test_messages:
        tts.speak(msg)
