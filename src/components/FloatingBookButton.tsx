import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/micro-interactions.css';

const FloatingBookButton = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show button after scrolling down 300px
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div 
      className={`fixed bottom-20 md:bottom-24 right-6 md:right-8 z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      <Link 
        to="/book" 
        className="btn-hover-effect ripple-effect flex items-center space-x-3 bg-gradient-to-r from-[#E3833B] to-[#FFB347] text-white px-8 py-4 md:px-10 md:py-5 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 touch-manipulation"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          className="w-6 h-6 md:w-7 md:h-7"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
          />
        </svg>
        <span className="font-bold text-lg md:text-xl">Book a Table</span>
      </Link>
    </div>
  );
};

export default FloatingBookButton;
