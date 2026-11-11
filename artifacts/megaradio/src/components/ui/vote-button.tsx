import { useState, useEffect, useRef, memo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { authQueryOptions } from '@/lib/auth-query';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';

interface VoteButtonProps {
  stationId: string;
  className?: string;
  size?: 'default' | 'mobile';
  label?: string;
}

const ThumbsUpIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M14 9V4C14 2.89543 13.1046 2 12 2C11.4477 2 11 2.44772 11 3V6.5C11 7.5 10.5 8.5 9.5 9.5L8 11H4C2.89543 11 2 11.8954 2 13V20C2 21.1046 2.89543 22 4 22H17C18.6569 22 20 20.6569 20 19V14C20 11.7909 18.2091 10 16 10H14V9Z"
      stroke="white" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M8 11V22"
      stroke="white" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

const VoteButton = memo(function VoteButton({ stationId, className = "", size = 'default', label = 'Vote for this station' }: VoteButtonProps) {
  // Figma: mobile icon 18.74x18.74, default icon 24x24
  const iconSize = size === 'mobile' ? '18.74px' : '24px';
  const [isAnimating, setIsAnimating] = useState(false);
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const client = useQueryClient();
  const {data:auth} = useQuery(authQueryOptions);
  const owner = auth?.user?._id || null;
  const active = useRef({stationId,owner}); active.current={stationId,owner};
  const flight = useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const voteKey = ['/api/stations',stationId,'vote',owner];
  const {data:state} = useQuery({queryKey:voteKey,queryFn:async()=>{
    const res=await apiRequest('GET',`/api/stations/${stationId}/vote`); return res.json() as Promise<{votes:number;hasVoted:boolean}>;
  },enabled:!!owner,retry:false,staleTime:30000});
  const hasVoted=!!state?.hasVoted;
  useEffect(()=>{setIsAnimating(false);if(timer.current)clearTimeout(timer.current);return()=>{if(timer.current)clearTimeout(timer.current);};},[stationId,owner]);
  const voteMessages: Record<string,Record<string,string>> = {
    tr:{vote_already_cast:'Bu radyoya zaten oy verdin.',vote_login_required:'Oy vermek için giriş yap.',vote_failed_message:'Oy gönderilemedi. Lütfen tekrar dene.'},
    de:{vote_already_cast:'Du hast bereits für diesen Sender gestimmt.',vote_login_required:'Melde dich an, um abzustimmen.',vote_failed_message:'Stimme konnte nicht gesendet werden. Bitte versuche es erneut.'},
  };
  const notice=(key:string,fallback:string)=>toast({description:t(key,voteMessages[language]?.[key] || fallback)});

  const voteMutation = useMutation({
    mutationFn: async ({id}:{id:string;actor:string}) => {
      const response=await apiRequest('POST', `/api/stations/${id}/vote`);
      const result=await response.json();
      if(result.success!==true||!Number.isFinite(result.votes))throw new Error('Invalid vote response');
      return result as {votes:number;alreadyVoted?:boolean};
    },
    onSuccess: (result,{id,actor}) => {
      if(!mounted.current||active.current.stationId!==id||active.current.owner!==actor)return;
      client.setQueryData(voteKey,{hasVoted:true,votes:result.votes});
      void client.invalidateQueries({predicate:query=>query.queryKey.some(part=>typeof part==='string'&&(/\/api\/(stations|radio-browser|admin\/radio-browser)/).test(part))&&query.queryKey[2]!=='vote'});
      if(result.alreadyVoted){notice('vote_already_cast','You have already voted for this station.');return;}
      if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
      setIsAnimating(true);
      timer.current=setTimeout(()=>setIsAnimating(false),600);
    },
    onError: (_error,{id,actor}) => {
      if(mounted.current&&active.current.stationId===id&&active.current.owner===actor)notice('vote_failed_message','Your vote could not be saved. Please try again.');
    },
    onSettled:()=>{flight.current=false;},
  });

  const handleVoteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if(flight.current)return;
    if(!owner){notice('vote_login_required','Sign in to vote for this station.');return;}
    if(hasVoted){notice('vote_already_cast','You have already voted for this station.');return;}
    flight.current=true;
    voteMutation.mutate({id:stationId,actor:owner});
  };

  return (
    <button
      onClick={handleVoteClick}
      disabled={voteMutation.isPending}
      className={`relative flex items-center justify-center rounded-full bg-black hover:opacity-80 transition-all ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={hasVoted}
      data-testid="button-vote-station"
      style={{
        transform: isAnimating ? 'scale(1.15)' : 'scale(1)',
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}
    >
      {voteMutation.isPending ? (
        <div className="w-5 h-5 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
      ) : (
        <div 
          style={{
            opacity: hasVoted ? 1 : 0.7,
            transform: isAnimating ? 'scale(1.1)' : 'scale(1)',
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            width: iconSize,
            height: iconSize
          }}
        >
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path 
              d="M14 9V4C14 2.89543 13.1046 2 12 2C11.4477 2 11 2.44772 11 3V6.5C11 7.5 10.5 8.5 9.5 9.5L8 11H4C2.89543 11 2 11.8954 2 13V20C2 21.1046 2.89543 22 4 22H17C18.6569 22 20 20.6569 20 19V14C20 11.7909 18.2091 10 16 10H14V9Z"
              stroke="white" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
            <path 
              d="M8 11V22"
              stroke="white" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      
      {isAnimating && (
        <div 
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
            animation: 'pulse-fade 0.6s ease-out forwards'
          }}
        />
      )}
      
      <style>{`
        @keyframes pulse-fade {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </button>
  );
});

export default VoteButton;
