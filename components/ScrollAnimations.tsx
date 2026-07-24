"use client";

import {useEffect} from "react";

export default function ScrollAnimations(){
  useEffect(()=>{
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;

    const targets=Array.from(document.querySelectorAll<HTMLElement>(
      "main > section, .appliance-category-card, .feature-product-card, .benefit, .category-trust-item"
    ));
    targets.forEach((element,index)=>{
      element.classList.add("scroll-reveal");
      element.style.setProperty("--reveal-delay",`${Math.min(index%4,3)*55}ms`);
    });

    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },{threshold:.09,rootMargin:"0px 0px -7% 0px"});
    targets.forEach(element=>observer.observe(element));

    const header=document.querySelector<HTMLElement>("header");
    const progress=document.querySelector<HTMLElement>(".scroll-progress");
    let lastY=window.scrollY;
    let ticking=false;
    const updateHeader=()=>{
      const currentY=window.scrollY;
      const movingDown=currentY>lastY;
      const maxScroll=Math.max(document.documentElement.scrollHeight-window.innerHeight,1);
      progress?.style.setProperty("transform",`scaleX(${Math.min(currentY/maxScroll,1)})`);
      header?.classList.toggle("scrolling-down",movingDown&&currentY>150);
      header?.classList.toggle("scrolling-up",!movingDown&&currentY>30);
      document.body.classList.toggle("page-scrolling-down",movingDown&&currentY>80);
      document.body.classList.toggle("page-scrolling-up",!movingDown&&currentY>80);
      if(currentY<=30)header?.classList.remove("scrolling-down","scrolling-up");
      lastY=currentY;
      ticking=false;
    };
    const onScroll=()=>{
      if(!ticking){
        window.requestAnimationFrame(updateHeader);
        ticking=true;
      }
    };
    window.addEventListener("scroll",onScroll,{passive:true});

    return()=>{
      observer.disconnect();
      window.removeEventListener("scroll",onScroll);
      header?.classList.remove("scrolling-down","scrolling-up");
      document.body.classList.remove("page-scrolling-down","page-scrolling-up");
      targets.forEach(element=>element.classList.remove("scroll-reveal","is-visible"));
    };
  },[]);
  return <div className="scroll-progress" aria-hidden="true"/>;
}
