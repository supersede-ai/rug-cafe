import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import '../styles/extra-animations.css';
import '../styles/micro-interactions.css';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import FloatingBookButton from '../components/FloatingBookButton';
import ImageGallery from '../components/ImageGallery';
import TeamSection from '../components/TeamSection';
import InstagramFeed from '../components/InstagramFeed';
import EventsCalendar from '../components/EventsCalendar';
import NewsletterSignup from '../components/NewsletterSignup';
import { initAllAnimations, addGrainTexture } from '../lib/animations';

const Index = () => {
  // Initialize animations on component mount
  useEffect(() => {
    // Add a small delay to ensure DOM is fully loaded
    const timer = setTimeout(() => {
      initAllAnimations();
      addGrainTexture();
    }, 100);
    
    // Cleanup on unmount
    return () => {
      clearTimeout(timer);
      // Remove any event listeners if needed
    };
  }, []);

  const featuredImages = [
    {
      src: 'https://2r66v53nwmfsqes8.public.blob.vercel-storage.com/photosFromInstagram2-iIiUF6so0LREToo7xXkXjNNlfd0p5G.jpg',
      alt: 'Matcha Latte Art',
      title: 'Specialty Drinks',
      description: 'Handcrafted with care, from classic espresso to signature matcha',
    },
    {
      src: 'https://2r66v53nwmfsqes8.public.blob.vercel-storage.com/photosFromInstagram5-ziW9iStMXLMjkqjAA2uZoKGhVVEGrz.jpg',
      alt: 'Banana Oatmeal Bowl',
      title: 'House Specialties',
      description: 'Fresh-baked delights featuring our house-made espresso butter',
    },
    {
      src: 'https://2r66v53nwmfsqes8.public.blob.vercel-storage.com/photosFromInstagram8-c9MLDs8OvwKpIf7OaPDrS1jLW0A9Hl.jpg',
      alt: 'Latte with Heart Art',
      title: 'Artisanal Coffee',
      description: 'Every cup tells a story, garnished with seasonal flowers',
    }
  ];

  const menuHighlights = [
    {
      src: 'https://2r66v53nwmfsqes8.public.blob.vercel-storage.com/photosFromInstagram6-g8B6wiehtr6aIDLcE1hlKYkLZTMKqF.jpg',
      alt: 'Korean-Inspired Breakfast',
      title: 'Asian Fusion Breakfast',
    },
    {
      src: 'https://2r66v53nwmfsqes8.public.blob.vercel-storage.com/photosFromInstagram3-ssSeDlHnRMhdbnKrA2WkFtpANoIPl2.jpg',
      alt: 'Banana Toast with Blueberries',
      title: 'Sweet Treats',
    },
    {
      src: 'https://2r66v53nwmfsqes8.public.blob.vercel-storage.com/photosFromInstagram11-9ukr9L9k9n8qWWBx8bXPhWfJTmTadm.jpg',
      alt: 'Iced Matcha Beverage',
      title: 'Signature Drinks',
    }
  ];

  return (
    <>
    <Layout transparentHeader>
      {/* Hero Section with enhanced animations */}
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden texture-grain">
        {/* Parallax/animated background overlay */}
        <div className="absolute inset-0 z-0 parallax" data-speed="0.05" style={{background: 'radial-gradient(ellipse at 60% 30%, #ffe6b8 0%, #F4EFE9 70%)'}} />
        
        {/* Animated shapes for depth and visual interest */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#E3833B]/15 rounded-full blur-3xl animate-pulse-slow z-0" />
        <div className="absolute bottom-32 right-24 w-64 h-64 bg-[#514640]/15 rounded-full blur-3xl animate-float z-0" />
        <div className="absolute top-1/2 left-1/4 w-48 h-48 bg-[#FFB347]/15 rounded-full blur-3xl animate-pulse-slow z-0" style={{animationDelay: '2s'}} />
      
        {/* Background image with parallax effect */}
        <div 
          className="absolute inset-0 opacity-25 parallax"
          data-speed="0.1"
          style={{
            backgroundImage: "url('https://2r66v53nwmfsqes8.public.blob.vercel-storage.com/photosFromInstagram9-Ogm8xP3xXSub3Pul9cofPQnyDE7qyz.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(8px)'
          }}
        />
        
        <div className="container mx-auto px-3 md:px-4 pt-8 md:pt-16 pb-12 text-center relative z-10">
          <div className="max-w-6xl mx-auto">
            {/* Text reveal animation for main heading */}
            <h1 className="text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-playfair font-black mb-6 md:mb-8 animate-blur-in opacity-0 text-[#3a2f2a]" style={{animationDelay: '200ms', animationFillMode: 'forwards', textShadow: '0 4px 20px rgba(0,0,0,0.1)'}}>
              Slow down. Sip. Savour.
            </h1>
            
            <p className="text-xl md:text-2xl lg:text-3xl mb-8 md:mb-12 max-w-4xl mx-auto animate-fade-in opacity-0 text-[#514640] font-medium leading-relaxed" style={{animationDelay: '400ms', animationFillMode: 'forwards'}}>
              Specialty coffee & modern brunch with Asian touches in a historic London pub
            </p>
            
            <div className="flex flex-col sm:flex-row justify-center sm:space-x-8 space-y-4 sm:space-y-0 animate-fade-in opacity-0" style={{animationDelay: '600ms', animationFillMode: 'forwards'}}>
              <Link 
                to="/book" 
                className="bg-[#E3833B] text-white px-12 py-5 rounded-full 
                  hover:bg-opacity-90 hover:shadow-2xl transition-all duration-300 transform hover:scale-105
                  font-bold text-xl shadow-xl btn-hover-effect ripple-effect"
              >
                Book a Table
              </Link>
              
              <Link 
                to="/menu" 
                className="border-2 border-[#514640] text-[#514640] px-12 py-5 
                  rounded-full hover:bg-[#514640] hover:text-white hover:shadow-xl transition-all duration-300 
                  transform hover:scale-105 font-bold text-xl ripple-effect"
              >
                View Menu
              </Link>
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-20 md:bottom-10 left-0 right-0 flex justify-center animate-float z-10">
          <div className="flex flex-col items-center text-[#514640]/90">
            <span className="text-base font-medium tracking-wide mb-3">Scroll to explore</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
      </div>

      {/* About/Our Story Section */}
      <section id="about" className="py-12 md:py-16 opacity-0 scroll-trigger">
        <div className="container mx-auto px-3 md:px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-16 items-center">
              <div className="flex justify-center lg:justify-start">
                <img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&w=400&q=80" alt="Founder portrait" className="w-56 h-56 md:w-64 md:h-64 object-cover rounded-full shadow-xl" />
              </div>
              <div className="text-center lg:text-left">
                <h2 className="text-5xl md:text-6xl font-playfair font-bold mb-6 text-[#3a2f2a]">Our Story</h2>
                <p className="text-xl md:text-2xl mb-6 leading-relaxed text-[#514640]">The Rug Café was born from a love of great coffee, community, and the vibrant flavors of London. Founded by <strong>Samira & the team</strong>, our mission is to create a welcoming space where everyone can slow down, sip, and savour the moment. Whether you're here for a quick espresso or a long brunch with friends, we hope you feel at home.</p>
                <blockquote className="italic text-[#E3833B] text-2xl md:text-3xl font-medium">"We believe every cup tells a story. Thank you for being part of ours."</blockquote>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Carousel with hover effects */}
      <section className="py-12 md:py-16 scroll-trigger">
        <div className="container mx-auto px-3 md:px-4">
          <h2 className="text-5xl md:text-6xl font-playfair font-bold mb-12 md:mb-16 text-center text-[#3a2f2a]">
            Featured Delights
          </h2>
          <Carousel className="mx-auto max-w-7xl">
          <CarouselContent>
            {featuredImages.map((image, index) => (
              <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                <Card className="border-none">
                  <CardContent className="p-2">
                    <div className="relative group overflow-hidden rounded-lg">
                      <img 
                        src={image.src} 
                        alt={image.alt}
                        className="w-full h-64 object-cover rounded-lg shadow-lg transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-lg flex items-center justify-center transform translate-y-4 group-hover:translate-y-0">
                        <div className="text-center px-4">
                          <h3 className="text-white font-semibold text-xl mb-2">{image.title}</h3>
                          <p className="text-white text-sm">{image.description}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex" />
          <CarouselNext className="hidden md:flex" />
        </Carousel>
        </div>
      </section>

      {/* Instagram Callout Section */}
      <section className="py-12 md:py-16 scroll-trigger">
        <div className="container mx-auto px-3 md:px-4 text-center">
          <a
            href="https://www.instagram.com/therug_london/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-4 px-10 py-6 rounded-full bg-gradient-to-r from-[#E3833B] to-[#FFB347] text-white font-bold text-2xl shadow-xl hover:scale-105 hover:from-[#d97706] hover:to-[#fbbf24] hover:shadow-2xl transition-all duration-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" width="36" height="36"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5A4.25 4.25 0 0 0 20.5 16.25v-8.5A4.25 4.25 0 0 0 16.25 3.5zm4.25 2.75a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5zm0 1.5a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5zm5.25 1.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"></path></svg>
            <span>Follow us on Instagram</span>
          </a>
          <p className="mt-8 text-[#514640] text-xl md:text-2xl max-w-3xl mx-auto font-medium">See our latest creations, behind-the-scenes, and community moments!</p>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-12 md:py-16 scroll-trigger">
        <div className="container mx-auto px-3 md:px-4">
          <h2 className="text-5xl md:text-6xl font-playfair font-bold mb-12 md:mb-16 text-center text-[#3a2f2a]">What Our Guests Say</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-7xl mx-auto">
            <div className="bg-[#fff7ed] rounded-2xl shadow-xl p-8 md:p-10 text-center hover-lift">
              <img src="https://randomuser.me/api/portraits/women/68.jpg" alt="Happy customer" className="w-20 h-20 rounded-full mb-6 mx-auto object-cover shadow-md" />
              <p className="italic mb-6 text-xl md:text-2xl leading-relaxed text-[#514640]">"The best brunch spot in London! The matcha latte and kimchi toastie are a must."</p>
              <span className="font-bold text-lg text-[#514640]">— Priya K.</span>
            </div>
            <div className="bg-[#fff7ed] rounded-2xl shadow-xl p-8 md:p-10 text-center hover-lift">
              <img src="https://randomuser.me/api/portraits/men/45.jpg" alt="Happy customer" className="w-20 h-20 rounded-full mb-6 mx-auto object-cover shadow-md" />
              <p className="italic mb-6 text-xl md:text-2xl leading-relaxed text-[#514640]">"Cosy vibe, friendly staff, and delicious food. I always bring my friends here."</p>
              <span className="font-bold text-lg text-[#514640]">— Alex M.</span>
            </div>
            <div className="bg-[#fff7ed] rounded-2xl shadow-xl p-8 md:p-10 text-center hover-lift">
              <img src="https://randomuser.me/api/portraits/women/33.jpg" alt="Happy customer" className="w-20 h-20 rounded-full mb-6 mx-auto object-cover shadow-md" />
              <p className="italic mb-6 text-xl md:text-2xl leading-relaxed text-[#514640]">"A hidden gem! The atmosphere is so relaxing and the pastries are divine."</p>
              <span className="font-bold text-lg text-[#514640]">— Fatima S.</span>
            </div>
          </div>
        </div>
      </section>

      {/* New Spotify Vibe Playlists Section */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-3 md:px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-5xl md:text-6xl font-playfair font-bold text-center mb-6 text-[#3a2f2a]">
              Curated Café Vibes
            </h2>
            <p className="text-center text-xl md:text-2xl mb-12 md:mb-16 text-[#514640] max-w-3xl mx-auto font-medium leading-relaxed">
              Soundtracks for your slow mornings, creative bursts, or golden hour reflections.  
              Press play, sip slow, and let the vibe guide you.
            </p>

            <div className="grid grid-cols-1 gap-8">
          <iframe 
            className="rounded-xl"
            src="https://open.spotify.com/embed/playlist/6kKHY6QoQ8yjSeRFuxxAe6?utm_source=generator" 
            width="100%" 
            height="152" 
            frameBorder="0" 
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
            loading="lazy"
          ></iframe>

          <iframe 
            className="rounded-xl"
            src="https://open.spotify.com/embed/playlist/3QR4U8K4kJmf4KA7fXhXnx?utm_source=generator" 
            width="100%" 
            height="152" 
            frameBorder="0" 
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
            loading="lazy"
          ></iframe>

          <iframe 
            className="rounded-xl"
            src="https://open.spotify.com/embed/playlist/2LCyCIPEEomXxZHX40JJsu?utm_source=generator" 
            width="100%" 
            height="152" 
            frameBorder="0" 
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
            loading="lazy"
          ></iframe>

          <iframe 
            className="rounded-xl"
            src="https://open.spotify.com/embed/playlist/0p68fLGT32eTB6ShCnQsNX?utm_source=generator" 
            width="100%" 
            height="152" 
            frameBorder="0" 
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
            loading="lazy"
          ></iframe>

          <iframe 
            className="rounded-xl"
            src="https://open.spotify.com/embed/playlist/0mXQxinHKxgu9jn6u9kDad?utm_source=generator" 
            width="100%" 
            height="152" 
            frameBorder="0" 
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
            loading="lazy"
          ></iframe>

          <iframe 
            className="rounded-xl"
            src="https://open.spotify.com/embed/playlist/2BazXuXu0AhYTbsZgEhVqZ?utm_source=generator" 
            width="100%" 
            height="152" 
            frameBorder="0" 
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
            loading="lazy"
          ></iframe>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-12 md:py-16 scroll-trigger">
        <div className="container mx-auto px-3 md:px-4">
        <TeamSection teamMembers={[
          {
            name: "Samira Ahmed",
            role: "Founder & Head Chef",
            bio: "With over 15 years of culinary experience across Asia and Europe, Samira founded The Rug Café to blend her passion for specialty coffee with innovative Asian-inspired cuisine. Her commitment to quality and community has made the café a beloved local institution.",
            image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=500&q=80",
            favoriteItem: "Kimchi Cheese Toastie with our house-blend espresso"
          },
          {
            name: "James Wilson",
            role: "Head Barista",
            bio: "A certified Q-grader with a background in specialty coffee shops across London, James brings his technical expertise and passion for perfect extraction to every cup. He's constantly experimenting with new brewing methods and seasonal beans.",
            image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80",
            favoriteItem: "Our seasonal single-origin pour-over"
          },
          {
            name: "Mei Lin",
            role: "Pastry Chef",
            bio: "Trained in both French and Japanese pastry techniques, Mei creates our signature baked goods that perfectly balance sweetness with complex flavors. Her matcha-infused pastries have developed a cult following among our regulars.",
            image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=500&q=80",
            favoriteItem: "Black sesame and white chocolate cookies"
          }
        ]} />
        </div>
      </section>

      {/* Events Calendar Section */}
      <section className="py-12 md:py-16 scroll-trigger">
        <div className="container mx-auto px-3 md:px-4">
          <div className="bg-[#F4EFE9]/50 py-12 md:py-16 rounded-3xl">
        <EventsCalendar events={[
          {
            id: "1",
            title: "Coffee Brewing Masterclass",
            description: "Join our head barista James for an interactive workshop on brewing methods. Learn the secrets behind the perfect pour-over, French press, and AeroPress techniques. All participants will receive a bag of our house-blend coffee beans to take home.",
            date: new Date(new Date().setDate(new Date().getDate() + 5)),
            time: "18:30 - 20:00",
            image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=500&q=80",
            ticketLink: "#"
          },
          {
            id: "2",
            title: "Asian Fusion Dinner Night",
            description: "A special evening featuring a six-course tasting menu that showcases our chef's innovative approach to Asian fusion cuisine. Each course is paired with either specialty tea, coffee, or natural wine. Limited seating available.",
            date: new Date(new Date().setDate(new Date().getDate() + 12)),
            time: "19:00 - 22:00",
            image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=500&q=80",
            ticketLink: "#"
          },
          {
            id: "3",
            title: "Latte Art Workshop",
            description: "Learn the basics of latte art from our expert baristas. This hands-on workshop will teach you how to create hearts, rosettas, and tulips in your coffee. Perfect for beginners and intermediate coffee enthusiasts.",
            date: new Date(new Date().setDate(new Date().getDate() + 19)),
            time: "10:30 - 12:00",
            image: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=500&q=80",
            ticketLink: "#"
          }
        ]} />
          </div>
        </div>
      </section>

      {/* Instagram Feed Section */}
      <section className="py-12 md:py-16 scroll-trigger">
        <div className="container mx-auto px-3 md:px-4">
          <InstagramFeed postCount={6} />
        </div>
      </section>

      {/* Menu Preview with scroll animations */}
      <section className="py-12 md:py-16 bg-white animate-fade-in-up opacity-0 [animation-delay:1300ms] [animation-fill-mode:forwards]">
        <div className="container mx-auto px-3 md:px-4">
          <h2 className="text-5xl md:text-6xl font-playfair font-bold mb-12 md:mb-16 text-center text-[#3a2f2a]">Current Favorites</h2>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-7xl mx-auto">
          {menuHighlights.map((item, index) => (
            <div 
              key={index} 
              className="group relative overflow-hidden rounded-lg shadow-lg transition-all duration-500 hover:-translate-y-2"
            >
              <div className="relative h-80 overflow-hidden">
                <img 
                  src={item.src} 
                  alt={item.alt}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-6 group-hover:translate-y-0 transition-transform duration-300">
                    <h3 className="text-white font-semibold text-xl">{item.title}</h3>
                    <p className="text-white/80 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
                      Discover our seasonal selection
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      </section>

      {/* About Section with parallax effect */}
      <section className="py-12 md:py-16 bg-[#F4EFE9]/50 relative overflow-hidden">
        <div className="container mx-auto px-3 md:px-4 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-5xl md:text-6xl font-playfair font-bold mb-12 md:mb-16 text-[#3a2f2a]">Our Heritage</h2>
            <div className="space-y-8 md:space-y-10 leading-relaxed">
              <p className="animate-fade-in text-xl md:text-2xl lg:text-3xl text-[#514640] font-medium">
                The Café brings new life to the historic Windsor Castle pub (est. 1829), 
                combining London's pub heritage with modern specialty coffee culture.
              </p>
              <p className="animate-fade-in [animation-delay:200ms] text-xl md:text-2xl lg:text-3xl text-[#514640] font-medium">
                We focus on sustainability, working with local suppliers and creating a 
                welcoming neighborhood space where everyone can slow down and savor the moment.
              </p>
            </div>
          </div>
        </div>
        <div 
          className="absolute inset-0 opacity-5 transform -skew-y-6 scale-125"
          style={{
            backgroundImage: "url('https://2r66v53nwmfsqes8.public.blob.vercel-storage.com/photosFromInstagram9-Ogm8xP3xXSub3Pul9cofPQnyDE7qyz.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed'
          }}
        />
      </section>
    </Layout>

    {/* Floating Book Button */}
    <FloatingBookButton />
    
    {/* Newsletter Signup */}
    <NewsletterSignup delay={8000} />
    </>
  );
};

export default Index;
