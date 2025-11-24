import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Package, TrendingUp, Users, Zap } from 'lucide-react';

interface StatItemProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  gradient: string;
}

const StatItem: React.FC<StatItemProps> = ({ icon, value, label, suffix = '', prefix = '', gradient }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(count, value, { duration: 2, ease: 'easeOut' });
    const unsubscribe = rounded.on('change', (latest) => setDisplayValue(latest));
    
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="group relative"
    >
      <div className="relative bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-gray-100 hover:border-primary-200">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl opacity-0 group-hover:opacity-5 transition-opacity`} />
        
        <div className="relative flex items-center gap-4">
          <div className={`p-3 bg-gradient-to-br ${gradient} rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
            {icon}
          </div>
          
          <div>
            <div className="text-3xl md:text-4xl font-black text-gray-900 mb-1">
              {prefix}
              {displayValue.toLocaleString()}
              {suffix}
            </div>
            <div className="text-sm font-semibold text-gray-600">
              {label}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const StatsCounter: React.FC = () => {
  const stats = [
    {
      icon: <Package className="w-6 h-6 text-white" />,
      value: 30000,
      label: 'Cards Available',
      gradient: 'from-primary-500 to-primary-600'
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-white" />,
      value: 500000,
      label: 'Market Data Points',
      prefix: '$',
      gradient: 'from-green-500 to-emerald-600'
    },
    {
      icon: <Users className="w-6 h-6 text-white" />,
      value: 1000,
      label: 'Active Users',
      suffix: '+',
      gradient: 'from-accent-500 to-accent-600'
    },
    {
      icon: <Zap className="w-6 h-6 text-white" />,
      value: 95,
      label: 'TCGPlayer Accuracy',
      suffix: '%',
      gradient: 'from-yellow-500 to-orange-600'
    }
  ];

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">
            TCGPlayer Integration
          </h2>
          <p className="text-xl text-gray-600 font-medium">
            Real market data • Live price tracking
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <StatItem key={index} {...stat} />
          ))}
        </div>
      </div>
    </section>
  );
};

