import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../styles/logo-animations.css';
import VoiceAssistantButton from '@/components/VoiceAssistantButton';
import CartSheet from '@/components/CartSheet';

type LayoutProps = {
  children: React.ReactNode;
  transparentHeader?: boolean;
};

const Layout = ({ children, transparentHeader = false }: LayoutProps) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Close mobile menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isMobileMenuOpen &&
        mobileMenuRef.current && 
        !mobileMenuRef.current.contains(event.target as Node) &&
        mobileMenuButtonRef.current &&
        !mobileMenuButtonRef.current.contains(event.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    // Cleanup the event listener on component unmount or when menu closes
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F4EFE9] text-[#514640] font-inter flex flex-col">
      <header className={`py-4 md:py-6 sticky top-0 z-50 bg-[#F4EFE9]/95 backdrop-blur-lg border-b border-[#514640]/10 shadow-lg transition-all duration-300`}>
        <div className="container mx-auto px-3 md:px-4 flex justify-between items-center">
          <Link to="/" className="w-28 md:w-32">
            <img 
              src="/logo_new.webp" 
              alt="The Rug Cafe Logo" 
              className="w-full h-auto transition-transform duration-500 ease-out opacity-0 translate-y-[-16px] animate-logo-fade-in hover:scale-110 hover:shadow-2xl hover:z-10 focus:outline-none"
              style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}
            />
          </Link>
          <nav className="hidden md:flex items-center w-full">
            {/* Right: actions */}
            <div className="flex items-center gap-4 lg:gap-6 ml-auto pr-1">
              <CartSheet />
              <Link to="/book" className="bg-[#E3833B] text-white px-6 py-3 rounded-full hover:bg-opacity-90 hover:shadow-lg transition-all duration-300 transform hover:scale-105 font-bold text-base whitespace-nowrap">
                Book a Table
              </Link>
              <Link
                to="/admin/bookings"
                className="border-2 border-[#514640] text-[#514640] px-5 py-2.5 rounded-full hover:bg-[#514640] hover:text-white transition-all duration-300 font-semibold text-base whitespace-nowrap"
                aria-label="Go to Admin Bookings"
              >
                Admin Bookings
              </Link>
            </div>
          </nav>

          {/* Collapsible menu button (shown on all breakpoints) */}
          <button
            ref={mobileMenuButtonRef}
            className="p-3 focus:outline-none touch-manipulation"
            aria-label="Open menu"
            onClick={toggleMobileMenu}
            aria-expanded={isMobileMenuOpen}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Collapsible nav dropdown - used on all sizes */}
          <div
            ref={mobileMenuRef}
            id="mobileNav"
            className={`absolute top-full right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl py-4 flex flex-col z-50 border border-[#514640]/10 ${isMobileMenuOpen ? 'block' : 'hidden'}`}
            tabIndex={-1}
            aria-label="Mobile navigation menu"
            aria-hidden={!isMobileMenuOpen}
          >
            <Link to="/" className="block px-6 py-4 text-lg font-medium hover:bg-[#F4EFE9] hover:text-[#E3833B] transition-colors touch-manipulation" onClick={closeMobileMenu}>Home</Link>
            <Link to="/menu" className="block px-6 py-4 text-lg font-medium hover:bg-[#F4EFE9] hover:text-[#E3833B] transition-colors touch-manipulation" onClick={closeMobileMenu}>Menu</Link>
            <Link to="/coffee" className="block px-6 py-4 text-lg font-medium hover:bg-[#F4EFE9] hover:text-[#E3833B] transition-colors touch-manipulation" onClick={closeMobileMenu}>Buy Coffee</Link>
            <Link to="/about" className="block px-6 py-4 text-lg font-medium hover:bg-[#F4EFE9] hover:text-[#E3833B] transition-colors touch-manipulation" onClick={closeMobileMenu}>About</Link>
            <div className="px-6 py-4"><CartSheet /></div>
            <Link 
              to="/book" 
              className="block mt-3 mx-6 mb-2 bg-[#E3833B] text-white px-8 py-4 text-center rounded-full hover:bg-opacity-90 hover:shadow-lg transition-all duration-300 font-bold text-lg touch-manipulation"
              onClick={closeMobileMenu}
            >
              Book a Table
            </Link>
            <Link
              to="/admin/bookings"
              className="block mx-6 mb-2 border-2 border-[#514640] text-[#514640] px-8 py-4 text-center rounded-full hover:bg-[#514640] hover:text-white transition-all duration-300 font-semibold text-lg touch-manipulation"
              onClick={closeMobileMenu}
            >
              Admin Bookings
            </Link>
            <Link
              to="/admin/voice"
              className="block mx-6 mb-2 border border-[#514640]/60 text-[#514640] px-8 py-3.5 text-center rounded-full hover:bg-[#514640] hover:text-white transition-all duration-300 font-semibold text-lg touch-manipulation"
              onClick={closeMobileMenu}
              aria-label="Open Voice Analytics dashboard"
            >
              Voice Analytics
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {children}
      </main>
      
      <footer className="bg-[#514640] text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            <div className="flex flex-col items-center md:items-start">
              <img 
                src="/logo_new.webp" 
                alt="The Rug Cafe Logo" 
                className="w-32 h-auto mb-6 transition-transform duration-500 ease-out opacity-0 translate-y-[-16px] animate-logo-fade-in hover:scale-110 hover:shadow-2xl hover:z-10 focus:outline-none invert"
                style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}
              />
              <p className="text-center md:text-left font-semibold mb-4 text-lg">309-311 Harrow Rd, London W9 3RG</p>
              <div className="w-full max-w-sm rounded-lg shadow-lg overflow-hidden mb-4">
                <iframe
                  title="The Rug Cafe Map"
                  src="https://www.google.com/maps?q=309-311+Harrow+Rd,+London+W9+3RG&output=embed"
                  width="100%"
                  height="200"
                  style={{ border: 0 }}
                  allowFullScreen={true}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                ></iframe>
              </div>
              <a
                href="https://maps.google.com/?q=309-311+Harrow+Rd,+London+W9+3RG"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-[#E3833B] text-white px-6 py-3 rounded-full hover:bg-opacity-90 transition-colors font-semibold"
              >
                Get Directions
              </a>
            </div>
            
            <div className="flex flex-col items-center md:items-end space-y-6">
              <div className="text-center md:text-right">
                <h3 className="font-semibold text-xl mb-2">Opening Hours</h3>
                <p className="text-lg">Mon-Sat: 08:00-18:00</p>
                <p className="text-lg">Sun: 08:00-16:00</p>
              </div>
              
              <div className="text-center md:text-right">
                <h3 className="font-semibold text-xl mb-2">Contact</h3>
                <button className="bg-[#E3833B] text-white px-6 py-3 rounded-full hover:bg-opacity-90 transition-colors font-semibold">
                  +44 (0)20-1234-5678
                </button>
              </div>
              
              <div className="text-center md:text-right">
                <h3 className="font-semibold text-xl mb-2">Follow Us</h3>
                <a href="https://www.instagram.com/therug_london/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-2 hover:text-[#E3833B] transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" width="24" height="24"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5A4.25 4.25 0 0 0 20.5 16.25v-8.5A4.25 4.25 0 0 0 16.25 3.5zm4.25 2.75a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5zm0 1.5a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5zm5.25 1.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"></path></svg>
                  <span>@therug_london</span>
                </a>
              </div>
            </div>
          </div>
          
          <div className="mt-12 flex flex-col md:flex-row items-center gap-2 md:gap-0 justify-center md:justify-between text-sm text-white/70">
            <p>© {new Date().getFullYear()} The Rug Café. All rights reserved.</p>
            <Link
              to="/admin/voice"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] text-white/80 hover:text-white hover:bg-white/15 hover:border-white/30 transition-colors"
              aria-label="Open Voice Analytics dashboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 opacity-80"><path d="M3 3.75A.75.75 0 0 1 3.75 3h16.5a.75.75 0 0 1 .75.75v16.5a.75.75 0 0 1-.75.75H3.75A.75.75 0 0 1 3 20.25zm4.5 11.5a.75.75 0 0 0-.75.75v2a.75.75 0 0 0 1.5 0v-2a.75.75 0 0 0-.75-.75Zm4-4a.75.75 0 0 0-.75.75v6a.75.75 0 1 0 1.5 0v-6a.75.75 0 0 0-.75-.75Zm4-3a.75.75 0 0 0-.75.75v9a.75.75 0 1 0 1.5 0v-9a.75.75 0 0 0-.75-.75Z"/></svg>
              <span className="tracking-wide">Voice Analytics</span>
            </Link>
          </div>
        </div>
      </footer>
      {/* Voice assistant floating button */}
      <VoiceAssistantButton />
      {/* Scroll-to-top button */}
      <button
        onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}
        className="fixed bottom-8 right-8 z-50 bg-[#E3833B] text-white rounded-full p-4 shadow-lg hover:bg-[#d97706] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
        aria-label="Scroll to top"
      style={{display: 'none'}}
      id="scrollToTopBtn"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="28" height="28"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    </button>
  </div>
  );
};

export default Layout;
