import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/micro-interactions.css';

interface NewsletterSignupProps {
  delay?: number; // Delay in milliseconds before showing the popup
  position?: 'bottom-right' | 'center';
}

const NewsletterSignup: React.FC<NewsletterSignupProps> = ({ 
  delay = 5000, 
  position = 'bottom-right' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if user has already closed the popup
    const hasClosedPopup = localStorage.getItem('rugCafeNewsletterClosed');
    
    if (!hasClosedPopup) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, delay);
      
      return () => clearTimeout(timer);
    }
  }, [delay]);

  const handleClose = () => {
    setIsOpen(false);
    // Remember that user closed the popup for 7 days
    localStorage.setItem('rugCafeNewsletterClosed', Date.now().toString());
    setTimeout(() => {
      setIsSuccess(false);
      setError('');
    }, 500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      setEmail('');
      
      // Close popup after success
      setTimeout(() => {
        handleClose();
      }, 3000);
    }, 1500);
  };

  const positionClasses = position === 'center' 
    ? 'fixed inset-0 flex items-center justify-center z-50'
    : 'fixed bottom-8 right-8 z-50';

  return (
    <>
      
      <AnimatePresence>
        {isOpen && (
          <div className={positionClasses}>
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className="bg-white rounded-xl shadow-2xl overflow-hidden max-w-md w-full mx-4"
            >
              <div className="relative">
                <button
                  onClick={handleClose}
                  className="absolute top-4 right-4 text-[#514640]/60 hover:text-[#514640] transition-colors"
                  aria-label="Close newsletter popup"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                <div className="p-6 pb-0">
                  <div className="w-16 h-16 bg-[#F4EFE9] rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#E3833B" className="w-8 h-8">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-playfair font-bold text-center mb-2">Join Our Community</h3>
                  <p className="text-center text-[#514640]/80 mb-6">
                    Subscribe to our newsletter for exclusive offers, events, and behind-the-scenes content.
                  </p>
                </div>
                
                <div className="p-6">
                  {isSuccess ? (
                    <div className="text-center py-4">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8 text-green-600">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h4 className="text-xl font-semibold mb-2">Thank You!</h4>
                      <p className="text-[#514640]/80">You've been added to our mailing list.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit}>
                      <div className="mb-4">
                        <input
                          type="email"
                          placeholder="Your email address"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`w-full p-3 border rounded-md focus-effect ${
                            error ? 'border-red-500' : 'border-[#514640]/20'
                          }`}
                        />
                        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-[#E3833B] text-white py-3 rounded-md hover:bg-opacity-90 transition-colors font-semibold btn-hover-effect"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Subscribing...
                          </span>
                        ) : (
                          'Subscribe'
                        )}
                      </button>
                    </form>
                  )}
                  
                  <p className="text-xs text-center text-[#514640]/60 mt-4">
                    We respect your privacy and will never share your information.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default NewsletterSignup;
