// src/components/GeneratingGraphOverlay.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react'; // Using a Bot icon for a futuristic AI feel

// Animation variants for Framer Motion to control fade-in/out effects
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const contentVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: { 
      delay: 0.2, 
      duration: 0.5,
      when: "beforeChildren", // Ensures parent animation finishes first
      staggerChildren: 0.3, // Animates children one after another
    } 
  },
};

const textVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

const GeneratingGraphOverlay: React.FC = () => {
  return (
    <motion.div
      style={styles.overlay}
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ duration: 0.4, ease: 'easeInOut' }}
    >
      <motion.div style={styles.content} variants={contentVariants}>
        <motion.div
          // This creates a continuous, slow-breathing and rotating animation for the icon
          animate={{ 
            rotate: 360, 
            scale: [1, 1.05, 1], // Creates a "breathing" effect
          }}
          transition={{
            duration: 5,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "loop",
          }}
          style={styles.iconContainer}
        >
          <Bot size={48} color="#58A6FF" />
        </motion.div>
        <motion.p style={styles.text} variants={textVariants}>
          ANALYZING CONTEXT
        </motion.p>
        <motion.p style={styles.subtext} variants={textVariants}>
          Constructing knowledge graph...
        </motion.p>
      </motion.div>
    </motion.div>
  );
};

// Centralized CSS-in-JS styles for a self-contained component
const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    // Using a semi-transparent dark color with a backdrop filter for a "glassmorphism" effect
    backgroundColor: 'rgba(13, 17, 23, 0.85)',
    backdropFilter: 'blur(10px)',
    zIndex: 2000, // Ensures it renders on top of everything
  },
  content: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem', // Provides spacing between elements
  },
  iconContainer: {
    padding: '1.5rem',
    borderRadius: '50%',
    // A subtle border and shadow give it a "floating" look
    border: '1px solid rgba(88, 166, 255, 0.2)',
    boxShadow: '0 0 40px rgba(88, 166, 255, 0.2)',
  },
  text: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#E6EDF3',
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.1em', // Wider letter spacing for a high-tech feel
  },
  subtext: {
    fontSize: '1rem',
    color: '#8B949E',
    margin: 0,
  }
};

export default GeneratingGraphOverlay;